import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { LogOut, Menu, X } from "lucide-react";
import { toast } from "sonner";
import { logout } from "@/features/auth/api/auth.api";
import { useAuthStore } from "@/features/auth/store/auth.store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { disconnectMonitorSocket } from "@/features/monitors/realtime/monitor-socket";
import { UserMenu } from "@/features/profile/components/user-menu";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
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
    disconnectMonitorSocket();
    clearSession();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 w-64 border-r border-border bg-background p-5 transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform lg:translate-x-0 lg:shadow-none",
          open ? "translate-x-0 shadow-2xl" : "-translate-x-full shadow-none",
        )}
      >
        <div className="flex items-center justify-between">
          <Link to="/dashboard" className="text-lg font-semibold tracking-wide">
            FaultLine<span className="text-muted-foreground">.</span>
          </Link>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="p-1 text-muted-foreground hover:text-foreground lg:hidden"
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
          <NavLink
            to="/dashboard"
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cn(
                "block rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-accent text-accent-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )
            }
          >
            Overview
          </NavLink>
          <NavLink
            to="/monitors"
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cn(
                "block rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-accent text-accent-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )
            }
          >
            Monitors
          </NavLink>
          <NavLink
            to="/incidents"
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cn(
                "block rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-accent text-accent-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )
            }
          >
            Incidents
          </NavLink>
          <NavLink
            to="/analytics"
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cn(
                "block rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-accent text-accent-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )
            }
          >
            Analytics
          </NavLink>
          <NavLink
            to="/status-pages"
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cn(
                "block rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-accent text-accent-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )
            }
          >
            Status Pages
          </NavLink>
          <p className="px-3 pt-6 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Settings
          </p>
          <NavLink
            to="/profile"
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cn(
                "block rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-accent text-accent-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )
            }
          >
            Profile
          </NavLink>
          <NavLink
            to="/settings/notifications"
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cn(
                "block rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-accent text-accent-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )
            }
          >
            Notifications
          </NavLink>
        </nav>

        <button
          className="absolute bottom-6 left-5 flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => setSignOutOpen(true)}
        >
          <LogOut size={16} /> Sign out
        </button>
      </aside>

      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
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

      <button
        className="nav-overlay fixed inset-0 z-20 bg-foreground/30 backdrop-blur-[2px] lg:hidden"
        data-open={open}
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        onClick={() => setOpen(false)}
        aria-label="Close navigation overlay"
      />

      <div className="lg:pl-64">
        <header className="flex h-16 items-center justify-between border-b border-border bg-background px-5 sm:px-8">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="rounded p-1 text-muted-foreground hover:text-foreground lg:hidden"
                onClick={() => setOpen(true)}
                aria-label="Open navigation"
              >
                <Menu size={20} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Open navigation</TooltipContent>
          </Tooltip>
          <div className="ml-auto">
            <UserMenu user={user} onSignOut={() => setSignOutOpen(true)} />
          </div>
        </header>

        <main className="page-enter mx-auto max-w-6xl space-y-10 px-5 py-10 sm:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
