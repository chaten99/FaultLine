import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PageLoader } from "@/components/common/page-loader";
import { refresh } from "@/features/auth/api/auth.api";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { LoginPage } from "@/features/auth/pages/login-page";
import { RegisterPage } from "@/features/auth/pages/register-page";
import { ForgotPasswordPage } from "@/features/auth/pages/forgot-password-page";
import { VerifyEmailPage } from "@/features/auth/pages/verify-email-page";
import { DashboardPage } from "@/features/dashboard/pages/dashboard-page";
import { MonitorsPage } from "@/features/monitors/pages/monitors-page";
import { MonitorDetailsPage } from "@/features/monitors/pages/monitor-details-page";
import { IncidentsPage } from "@/features/incidents/pages/incidents-page";
import { AnalyticsPage } from "@/features/analytics/pages/analytics-page";
import { IncidentDetailsPage } from "@/features/incidents/pages/incident-details-page";
import { NotificationsPage } from "@/features/notifications/pages/notifications-page";

export default function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  const status = useAuthStore((state) => state.status);
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);

  useEffect(() => {
    void refresh()
      .then(({ data }) => setSession(data.user, data.accessToken))
      .catch(() => clearSession());
  }, [clearSession, setSession]);

  if (status === "loading") return <PageLoader />;

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={350}>
        <Routes>
          <Route
            path="/forgot-password"
            element={
              <PublicRoute>
                <ForgotPasswordPage />
              </PublicRoute>
            }
          />
          <Route
            path="/verify-email"
            element={
              <PublicRoute>
                <VerifyEmailPage />
              </PublicRoute>
            }
          />
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicRoute>
                <RegisterPage />
              </PublicRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/monitors"
            element={
              <ProtectedRoute>
                <MonitorsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/monitors/:id"
            element={
              <ProtectedRoute>
                <MonitorDetailsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/incidents"
            element={
              <ProtectedRoute>
                <IncidentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/incidents/:id"
            element={
              <ProtectedRoute>
                <IncidentDetailsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings/notifications"
            element={
              <ProtectedRoute>
                <NotificationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <AnalyticsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="*"
            element={<Navigate to={status === "authenticated" ? "/dashboard" : "/login"} replace />}
          />
        </Routes>
        <Toaster
          position="bottom-right"
          closeButton
          theme="light"
          toastOptions={{
            className: "group border-border bg-background text-foreground shadow-md",
            classNames: {
              title: "text-sm font-semibold text-foreground",
              description: "text-sm text-muted-foreground",
              actionButton: "bg-primary text-primary-foreground hover:bg-primary/90",
              cancelButton: "bg-muted text-muted-foreground hover:bg-accent",
              closeButton:
                "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
              success: "border-border",
              info: "border-border",
              warning: "border-border",
              error: "border-destructive/50",
            },
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((state) => state.status);
  return status === "authenticated" ? <Navigate to="/dashboard" replace /> : children;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (status === "unauthenticated")
      navigate("/login", { replace: true, state: { from: location.pathname } });
  }, [location.pathname, navigate, status]);
  return status === "authenticated" ? children : null;
}
