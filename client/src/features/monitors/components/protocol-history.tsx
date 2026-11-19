import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ProtocolDetailsView } from "./protocol-details";
import type { MonitorCheck } from "../api/monitors.api";
import type { Maintenance } from "@/features/maintenance/maintenance-page";
export function MaintenanceBadge({ monitorId }: { monitorId: string }) {
  const query = useQuery({
    queryKey: ["maintenance"],
    queryFn: async () =>
      (await apiClient.get<{ items: Maintenance[] }>("/maintenance-windows")).data.items,
    refetchInterval: 30000,
  });
  const active = query.data?.filter(
    (w) => w.state === "active" && (!w.monitorIds.length || w.monitorIds.includes(monitorId)),
  );
  return active?.length ? <Badge variant="outline">Under maintenance</Badge> : null;
}
export function ProtocolHistory({ monitorId }: { monitorId: string }) {
  const query = useQuery({
    queryKey: ["protocol-history", monitorId],
    queryFn: async () =>
      (
        await apiClient.get<{ items: MonitorCheck[] }>(
          "/monitors/" + monitorId + "/protocol-history",
        )
      ).data.items,
    refetchInterval: 60000,
  });
  if (query.isLoading) return <Skeleton className="h-28" />;
  if (query.error)
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        Protocol history is currently unavailable.
      </p>
    );
  if (!query.data?.length)
    return (
      <p className="text-sm text-muted-foreground">
        Protocol measurements will appear after the first completed check.
      </p>
    );
  return (
    <section className="space-y-4">
      <h2 className="font-semibold">Protocol measurements</h2>
      <ProtocolDetailsView details={query.data[0].details} />
      <div className="overflow-auto rounded border">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b">
              <th className="p-3">Measured</th>
              <th>Health</th>
              <th>DNS duration</th>
              <th>Days to expiry</th>
            </tr>
          </thead>
          <tbody>
            {query.data.slice(0, 50).map((c) => (
              <tr key={c._id} className="border-b">
                <td className="p-3">{new Date(c.completedAt ?? c.startedAt).toLocaleString()}</td>
                <td>{c.status}</td>
                <td>{c.monitorType === "dns" ? c.executionDurationMs + " ms" : "—"}</td>
                <td>{c.details?.daysRemaining ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
