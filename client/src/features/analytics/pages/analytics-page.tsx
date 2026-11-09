import { useMemo, useState } from "react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { AnalyticsSection, ErrorPanel } from "../components/section-state";
import { AnalyticsToolbar } from "../components/analytics-toolbar";
import {
  AvailabilitySection,
  IncidentsSection,
  ResponseTimeSection,
} from "../components/analytics-sections";
import { MonitorsTableSection } from "../components/monitors-table-section";
import { SummaryCards, SummaryCardsSkeleton } from "../components/summary-cards";
import { useMonitorOptions, useOverview } from "../hooks/use-analytics";
import {
  anchorNow,
  browserTimeZone,
  formatRangeLabel,
  parseRangeState,
  serializeRangeState,
  toAnalyticsQuery,
  type RangeState,
} from "../lib/analytics-range";
import { useAnalyticsSocket } from "../realtime/use-analytics-socket";
import type { RangeKey } from "../types/analytics.types";

export function AnalyticsPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [anchor, setAnchor] = useState(() => anchorNow(Date.now()));

  useAnalyticsSocket();

  const state = useMemo(() => parseRangeState(params, Date.now()), [params]);
  const query = useMemo(() => toAnalyticsQuery(state, anchor), [state, anchor]);
  const monitorOptions = useMonitorOptions();
  const overview = useOverview(query);
  const fetching = useIsFetching({ queryKey: ["analytics"] }) > 0;

  const update = (next: RangeState) => {
    setParams(serializeRangeState(next), { replace: true });
  };

  const changeRange = (range: RangeKey) => {
    setAnchor(anchorNow(Date.now()));
    if (range === "custom") {
      const to = new Date(anchorNow(Date.now()));
      const from = new Date(to.getTime() - 7 * 86_400_000);
      update({ ...state, range, from: from.toISOString(), to: to.toISOString() });
      return;
    }
    update({ range, monitorId: state.monitorId });
  };

  const applyCustom = (from: Date, to: Date) => {
    update({ ...state, range: "custom", from: from.toISOString(), to: to.toISOString() });
  };

  const changeMonitor = (monitorId: string | undefined) => {
    update({ ...state, monitorId });
  };

  const refresh = () => {
    setAnchor(anchorNow(Date.now()));
    void queryClient.invalidateQueries({ queryKey: ["analytics"] });
  };

  const monitors = monitorOptions.data ?? [];
  const scopeLabel = state.monitorId
    ? (monitors.find((monitor) => monitor.id === state.monitorId)?.name ?? "Selected monitor")
    : "All monitors";

  return (
    <DashboardLayout>
      <div className="space-y-10">
        <header className="space-y-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Analytics</h1>
            <p className="text-sm text-muted-foreground">
              Understand API availability, performance and reliability across your monitored
              services.
            </p>
          </div>
          <AnalyticsToolbar
            state={state}
            query={query}
            monitors={monitors}
            refreshing={fetching}
            onRangeChange={changeRange}
            onCustomApply={applyCustom}
            onMonitorChange={changeMonitor}
            onRefresh={refresh}
          />
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {scopeLabel} - {formatRangeLabel(query.from, query.to)} ({browserTimeZone()}). Data is
            stored in UTC and shown in your browser timezone.
          </p>
        </header>

        <AnalyticsSection title="Overview">
          {overview.isError ? (
            <ErrorPanel
              error={overview.error}
              onRetry={() => void overview.refetch()}
              retrying={overview.isFetching}
            />
          ) : overview.isLoading || !overview.data ? (
            <SummaryCardsSkeleton />
          ) : (
            <SummaryCards
              summary={overview.data.current}
              comparison={overview.data.previous ? overview.data.comparison : null}
            />
          )}
        </AnalyticsSection>

        <ResponseTimeSection query={query} />
        <AvailabilitySection query={query} />

        <AnalyticsSection
          title="Monitors"
          description="Compare monitors. Rows with partial or insufficient data are labelled and should not be compared directly with complete ones."
        >
          <MonitorsTableSection query={query} />
        </AnalyticsSection>

        <IncidentsSection query={query} />
      </div>
    </DashboardLayout>
  );
}
