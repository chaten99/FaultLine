import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useMonitorsAnalytics } from "../hooks/use-analytics";
import {
  INSUFFICIENT,
  formatDuration,
  formatMs,
  formatPercent,
  presentAvailability,
} from "../lib/analytics-format";
import { ariaSort, dataQualityLabel, formatTimestamp, nextSort } from "../lib/analytics-series";
import type {
  AnalyticsQuery,
  DataQuality,
  MonitorAnalyticsRow,
  MonitorSortField,
  SortOrder,
} from "../types/analytics.types";
import { EmptyPanel, ErrorPanel } from "./section-state";

const PAGE_SIZE = 10;

const columns: { field: MonitorSortField; label: string; align?: "right" }[] = [
  { field: "availability", label: "Availability", align: "right" },
  { field: "successRate", label: "Success rate", align: "right" },
  { field: "coverage", label: "Coverage", align: "right" },
  { field: "downtime", label: "Downtime", align: "right" },
  { field: "avgResponse", label: "Avg response", align: "right" },
  { field: "incidents", label: "Incidents", align: "right" },
  { field: "lastCheck", label: "Last check" },
];

function QualityBadge({ quality }: { quality: DataQuality }) {
  return (
    <Badge
      variant={quality === "complete" ? "outline" : "muted"}
      className={cn(
        quality === "partial" && "border-amber-500/40 text-amber-700 dark:text-amber-400",
        quality === "insufficient" && "border-dashed",
      )}
    >
      {dataQualityLabel[quality]}
    </Badge>
  );
}

const metricText = (row: MonitorAnalyticsRow) => ({
  availability: presentAvailability(row.availability).value,
  success: formatPercent(row.successRate.percent, 2) ?? "No data",
  coverage: formatPercent(row.coverage.percent, 1) ?? "Unknown",
  downtime: row.downtimeMs === null ? INSUFFICIENT : formatDuration(row.downtimeMs),
  response: row.avgResponseMs === null ? "No data" : formatMs(row.avgResponseMs),
  lastCheck: row.lastCheckAt ? formatTimestamp(row.lastCheckAt) : "Never",
});

export function MonitorsTableSection({ query }: { query: AnalyticsQuery }) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ sortBy: MonitorSortField; sortOrder: SortOrder }>({
    sortBy: "name",
    sortOrder: "asc",
  });
  const [status, setStatus] = useState<"all" | "active" | "paused">("all");
  const [quality, setQuality] = useState<"all" | DataQuality>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, isError, error, refetch, isFetching } = useMonitorsAnalytics({
    ...query,
    page,
    pageSize: PAGE_SIZE,
    sortBy: sort.sortBy,
    sortOrder: sort.sortOrder,
    status,
    quality,
    search: search || undefined,
  });

  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;

  const header = (field: MonitorSortField, label: string, align?: "right") => (
    <TableHead
      key={field}
      aria-sort={ariaSort(sort, field)}
      className={align === "right" ? "text-right" : ""}
    >
      <button
        type="button"
        onClick={() => {
          setSort((current) => nextSort(current, field));
          setPage(1);
        }}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          align === "right" && "flex-row-reverse",
        )}
      >
        {label}
        {sort.sortBy === field ? (
          sort.sortOrder === "asc" ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )
        ) : null}
      </button>
    </TableHead>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search monitors"
            aria-label="Search monitors"
            className="pl-9"
            maxLength={100}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex">
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as typeof status);
              setPage(1);
            }}
          >
            <SelectTrigger aria-label="Filter by monitor status" className="sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={quality}
            onValueChange={(value) => {
              setQuality(value as typeof quality);
              setPage(1);
            }}
          >
            <SelectTrigger aria-label="Filter by data quality" className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All data quality</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
              <SelectItem value="partial">Partial data</SelectItem>
              <SelectItem value="insufficient">Insufficient data</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isError ? (
        <ErrorPanel error={error} onRetry={() => void refetch()} retrying={isFetching} />
      ) : isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyPanel
          title="No monitors match"
          description="Adjust the filters, or create a monitor to start collecting analytics."
        />
      ) : (
        <>
          <div className="hidden rounded-lg border border-border bg-background md:block">
            <Table className="min-w-[56rem]">
              <TableHeader>
                <TableRow>
                  {header("name", "Monitor")}
                  {columns.map((column) => header(column.field, column.label, column.align))}
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => {
                  const text = metricText(row);
                  const muted = row.dataQuality !== "complete";
                  return (
                    <TableRow
                      key={row.monitorId}
                      onClick={() => void navigate(`/monitors/${row.monitorId}`)}
                      className="cursor-pointer"
                    >
                      <TableCell className="max-w-56">
                        <Link
                          to={`/monitors/${row.monitorId}`}
                          onClick={(event) => event.stopPropagation()}
                          className="block truncate font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                        >
                          {row.name}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">{row.endpoint}</p>
                        {!row.active ? (
                          <p className="text-xs text-muted-foreground">Paused</p>
                        ) : null}
                      </TableCell>
                      <TableCell
                        className={cn("text-right tabular-nums", muted && "text-muted-foreground")}
                      >
                        {text.availability}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{text.success}</TableCell>
                      <TableCell className="text-right tabular-nums">{text.coverage}</TableCell>
                      <TableCell
                        className={cn("text-right tabular-nums", muted && "text-muted-foreground")}
                      >
                        {text.downtime}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{text.response}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.incidentCount}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                        {text.lastCheck}
                      </TableCell>
                      <TableCell>
                        <QualityBadge quality={row.dataQuality} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-3 md:hidden">
            {items.map((row) => {
              const text = metricText(row);
              return (
                <li key={row.monitorId}>
                  <Link
                    to={`/monitors/${row.monitorId}`}
                    className="block space-y-3 rounded-lg border border-border bg-background p-4 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{row.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{row.endpoint}</p>
                      </div>
                      <QualityBadge quality={row.dataQuality} />
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      {[
                        ["Availability", text.availability],
                        ["Success rate", text.success],
                        ["Coverage", text.coverage],
                        ["Downtime", text.downtime],
                        ["Avg response", text.response],
                        ["Incidents", String(row.incidentCount)],
                      ].map(([label, value]) => (
                        <div key={label} className="min-w-0">
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd className="truncate font-medium">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="text-xs text-muted-foreground">Last check: {text.lastCheck}</p>
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Page {data?.page ?? page} of {totalPages}
              {data ? ` - ${data.total} ${data.total === 1 ? "monitor" : "monitors"}` : ""}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" /> Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || isFetching}
                onClick={() => setPage((current) => current + 1)}
                aria-label="Next page"
              >
                Next <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
