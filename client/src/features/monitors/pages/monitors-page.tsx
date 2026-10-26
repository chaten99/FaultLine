import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { MonitorManagement } from "../components/monitor-management";

export function MonitorsPage() {
  return (
    <DashboardLayout>
      <MonitorManagement />
    </DashboardLayout>
  );
}
