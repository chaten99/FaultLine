import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PageLoader } from "@/components/common/page-loader";
import { currentUser, refresh } from "@/features/auth/api/auth.api";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { LoginPage } from "@/features/auth/pages/login-page";
import { RegisterPage } from "@/features/auth/pages/register-page";
import { ForgotPasswordPage } from "@/features/auth/pages/forgot-password-page";
import { VerifyEmailPage } from "@/features/auth/pages/verify-email-page";
import { DashboardPage } from "@/features/dashboard/pages/dashboard-page";

export default function App() {
  const status = useAuthStore((state) => state.status);
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);
  useEffect(() => {
    void refresh()
      .then(async ({ data }) => {
        const userResponse = await currentUser();
        setSession(userResponse.data.user, data.accessToken);
      })
      .catch(() => clearSession());
  }, [clearSession, setSession]);
  if (status === "loading") return <PageLoader />;
  return (
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
