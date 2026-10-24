import { Activity, AlertTriangle, CircleHelp, Server } from "lucide-react";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { MonitorManagement } from "@/features/monitors/components/monitor-management";

export function DashboardPage() {
  const user = useAuthStore((state) => state.user);

  return (
    <DashboardLayout>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">Overview</p>
          <h1 className="mt-2 font-serif text-4xl">Welcome back, {user?.name.split(" ")[0]}</h1>
          <p className="mt-2 text-muted-foreground">Your services at a glance.</p>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <button
              aria-label="About service statuses"
              className="rounded-md border border-border bg-background p-2 text-muted-foreground shadow-xs hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <CircleHelp size={18} />
            </button>
          </PopoverTrigger>
          <PopoverContent>
            <h2 className="font-semibold">About your overview</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              This space will summarize your configured services and their latest checks once
              monitoring is available.
            </p>
          </PopoverContent>
        </Popover>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <Summary icon={<Server size={18} />} title="Monitors" value="Configured below" />
        <Summary icon={<AlertTriangle size={18} />} title="Open incidents" value="None yet" />
        <Summary icon={<Activity size={18} />} title="Recent checks" value="No activity yet" />
      </section>

      <MonitorManagement />
    </DashboardLayout>
  );
}

function Summary({ icon, title, value }: { icon: React.ReactNode; title: string; value: string }) {
  return (
    <article className="rounded-lg border border-border bg-card p-5 text-card-foreground shadow-xs">
      <div className="mb-5 flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-sm">{title}</span>
      </div>
      <p className="text-lg font-medium text-foreground">{value}</p>
    </article>
  );
}
