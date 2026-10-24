import { Activity, AlertTriangle, CircleHelp, LogOut, Menu, Server, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { logout } from "@/features/auth/api/auth.api";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { useNavigate } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function DashboardPage() {
  const [open, setOpen] = useState(false);
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const navigate = useNavigate();
  const signOut = async () => {
    try {
      await logout();
    } catch {
      toast.error("We couldn't complete sign out. Please try again.");
      return;
    }
    clearSession();
    navigate("/login", { replace: true });
  };
  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside
        className={`fixed inset-y-0 left-0 z-20 w-64 border-r border-border bg-background p-5 transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between">
          <span className="text-lg font-semibold tracking-wide">
            FaultLine<span className="text-muted-foreground">.</span>
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="lg:hidden"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
              >
                <X size={19} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Close navigation</TooltipContent>
          </Tooltip>
        </div>
        <nav className="mt-12 space-y-2" aria-label="Main navigation">
          <div className="rounded-md bg-accent px-3 py-2.5 text-sm font-medium text-accent-foreground">
            Overview
          </div>
          <div className="flex items-center justify-between px-3 py-2.5 text-sm text-muted-foreground">
            Monitors <span className="text-[10px] uppercase tracking-wide">Soon</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2.5 text-sm text-muted-foreground">
            Incidents <span className="text-[10px] uppercase tracking-wide">Soon</span>
          </div>
        </nav>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="absolute bottom-6 left-5 flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
              <LogOut size={16} /> Sign out
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sign out of FaultLine?</AlertDialogTitle>
              <AlertDialogDescription>
                You can sign back in whenever you're ready. Your current session will be closed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void signOut()}>Sign out</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </aside>
      {open && (
        <button
          className="fixed inset-0 z-10 bg-foreground/20 lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close navigation overlay"
        />
      )}
      <div className="lg:pl-64">
        <header className="flex h-16 items-center justify-between border-b border-border bg-background px-5 sm:px-8">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="rounded p-1 lg:hidden"
                onClick={() => setOpen(true)}
                aria-label="Open navigation"
              >
                <Menu size={20} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Open navigation</TooltipContent>
          </Tooltip>
          <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
            <span>{user?.name}</span>
            <div className="grid size-8 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
              {user?.name.slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl space-y-10 px-5 py-10 sm:px-8">
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
                  className="rounded-md border border-border bg-background p-2 text-muted-foreground shadow-sm hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
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
            <Summary icon={<Server size={18} />} title="Monitors" value="Not set up yet" />
            <Summary icon={<AlertTriangle size={18} />} title="Open incidents" value="None yet" />
            <Summary icon={<Activity size={18} />} title="Recent checks" value="No activity yet" />
          </section>
          <Alert className="border-border bg-muted text-foreground">
            <AlertTitle>Monitoring setup is coming soon</AlertTitle>
            <AlertDescription>
              Connect your first service when monitoring becomes available.
            </AlertDescription>
          </Alert>
          <section className="rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
            <h2 className="text-lg font-medium">Recent activity</h2>
            <div className="flex min-h-40 items-center justify-center text-center">
              <div>
                <p className="text-sm text-muted-foreground">
                  Your service activity will appear here after you add your first monitor.
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  More monitoring features are coming soon.
                </p>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
function Summary({ icon, title, value }: { icon: React.ReactNode; title: string; value: string }) {
  return (
    <article className="rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm">
      <div className="mb-5 flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-sm">{title}</span>
      </div>
      <p className="text-lg font-medium text-foreground">{value}</p>
    </article>
  );
}
