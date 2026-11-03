import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { MonitorManagement } from "../components/monitor-management";
import { useMonitorSocket } from "../realtime/use-monitor-socket";

export function MonitorsPage() {
  useMonitorSocket();
  return (
    <DashboardLayout>
      <MonitorManagement />
    </DashboardLayout>
  );
}
