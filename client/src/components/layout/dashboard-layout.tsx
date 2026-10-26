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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
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
        className={cn(
          "fixed inset-y-0 left-0 z-20 w-64 border-r border-border bg-background p-5 transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
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
                className="rounded p-1 text-muted-foreground hover:text-foreground lg:hidden"
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
              {user?.name?.slice(0, 1).toUpperCase() ?? "U"}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl space-y-10 px-5 py-10 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
