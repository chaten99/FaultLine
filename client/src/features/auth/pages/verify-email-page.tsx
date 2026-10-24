import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AuthLayout } from "../components/auth-layout";
import { OtpVerification } from "../components/otp-verification";
import { useAuthStore } from "../store/auth.store";

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useAuthStore((state) => state.setSession);
  const state = location.state as { email?: string; challengeId?: string; purpose?: "email" | "login" } | null;
  const email = state?.email ?? params.get("email") ?? "";
  const purpose = state?.purpose ?? "email";
  return (
    <AuthLayout>
      <div className="w-full max-w-md space-y-8">
        <div>
          <p className="text-sm font-semibold text-foreground">FaultLine</p>
          <h1 className="mt-2 font-serif text-4xl">Verify your email</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter the six-digit code we sent you.
          </p>
        </div>
        <OtpVerification
          email={email}
          purpose={purpose}
          challengeId={state?.challengeId}
          onVerified={(value) => {
            if (purpose === "login") {
              if (value && typeof value !== "string" && "accessToken" in value) {
                toast.success("Email verified successfully.");
                setSession(value.user, value.accessToken);
                navigate("/dashboard", { replace: true });
              }
            } else {
              toast.success("Email verified. You can now sign in.");
              navigate("/login", { replace: true });
            }
          }}
        />
        <Link className="block text-center text-sm underline" to="/login">
          Back to sign in
        </Link>
      </div>
    </AuthLayout>
  );
}
