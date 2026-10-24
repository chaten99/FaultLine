import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { forgotPassword, resetPassword } from "../api/auth.api";
import { getApiErrorMessage } from "@/lib/api-error";
import { PasswordInput } from "../components/password-input";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { AuthLayout } from "../components/auth-layout";
import { OtpVerification } from "../components/otp-verification";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [grant, setGrant] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [step, setStep] = useState<"email" | "code" | "password">("email");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submit = async () => {
    setIsSubmitting(true);
    try {
      if (step === "email") {
        await forgotPassword({ email });
        setStep("code");
        toast.success("If an account exists, a reset code has been sent.");
      } else {
        if (password.length < 8) {
          setPasswordError("Use at least 8 characters.");
          return;
        }
        if (password !== confirmPassword) {
          setPasswordError("Passwords do not match.");
          return;
        }
        await resetPassword({ grant, password });
        toast.success("Password reset. You can now sign in.");
        setStep("email");
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };
  return (
    <AuthLayout>
      <div className="w-full max-w-md space-y-8">
        <div>
          <p className="text-sm font-semibold text-foreground">FaultLine</p>
          <h1 className="mt-2 font-serif text-4xl">Reset your password</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We'll help you get back into your account.
          </p>
        </div>
        <div className="space-y-5">
          {step === "email" && (
            <Field label="Email">
              <input
                className="field"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
          )}
          {step === "code" && (
            <OtpVerification
              email={email}
              purpose="reset"
              onVerified={(value) => {
                if (typeof value === "string") {
                  setGrant(value);
                  setStep("password");
                }
              }}
            />
          )}
          {step === "password" && (
            <>
              <Field label="New password">
                <PasswordInput
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setPasswordError("");
                  }}
                  autoComplete="new-password"
                />
              </Field>
              <Field label="Confirm password" error={passwordError}>
                <PasswordInput
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                    setPasswordError("");
                  }}
                  autoComplete="new-password"
                />
              </Field>
            </>
          )}
        </div>
        {step !== "code" && (
          <button
            disabled={isSubmitting}
            className="flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => void submit()}
          >
            {isSubmitting ? (
              <LoadingSpinner
                label={step === "email" ? "Sending code..." : "Resetting password..."}
              />
            ) : step === "email" ? (
              "Send reset code"
            ) : (
              "Reset password"
            )}
          </button>
        )}
        <Link className="block text-center text-sm underline" to="/login">
          Back to sign in
        </Link>
      </div>
    </AuthLayout>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2 text-sm font-medium text-foreground">
      <span>{label}</span>
      {children}
      {error && <span className="block text-xs text-destructive">{error}</span>}
    </label>
  );
}
