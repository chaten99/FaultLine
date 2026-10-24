import { useState } from "react";
import { toast } from "sonner";
import { InputOTP } from "@/components/ui/input-otp";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { getApiErrorMessage } from "@/lib/api-error";
import { forgotPassword, resendVerification, verifyEmail, verifyResetOtp } from "../api/auth.api";

type Purpose = "email" | "reset" | "login";

export function OtpVerification({
  email,
  purpose,
  challengeId,
  onVerified,
}: {
  email: string;
  purpose: Purpose;
  challengeId?: string;
  onVerified: (
    value?: string | { accessToken: string; user: { id: string; name: string; email: string } },
  ) => void;
}) {
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [invalid, setInvalid] = useState(false);
  const maskedEmail = email.replace(/^(.{2}).*(@.*)$/, "$1•••$2");

  const startCooldown = () => {
    setCooldown(60);
    const timer = window.setInterval(() => {
      setCooldown((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
  };

  const verify = async () => {
    if (code.length !== 6) return;
    setIsVerifying(true);
    setInvalid(false);
    try {
      if (purpose === "email" || purpose === "login") {
        const response = await verifyEmail({ email, code, challengeId });
        if (purpose === "login" && "accessToken" in response.data) onVerified(response.data);
        else onVerified();
      } else {
        const response = await verifyResetOtp({ email, code });
        onVerified(response.data.grant);
      }
    } catch (error) {
      setInvalid(true);
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsVerifying(false);
    }
  };

  const resend = async () => {
    setIsResending(true);
    try {
      if (purpose === "email" || purpose === "login")
        await resendVerification({ email, challengeId });
      else await forgotPassword({ email });
      setCode("");
      setInvalid(false);
      startCooldown();
      toast.success("A new verification code has been sent.");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1 text-sm">
        <p className="text-muted-foreground">Code sent to</p>
        <p className="font-medium text-foreground">{maskedEmail}</p>
      </div>
      <div className="space-y-2">
        <InputOTP
          maxLength={6}
          value={code}
          onChange={(value) => {
            setCode(value.replace(/\D/g, ""));
            setInvalid(false);
          }}
          disabled={isVerifying || isResending}
          aria-label={`${purpose === "reset" ? "Password reset" : "Email verification"} code`}
          aria-invalid={invalid}
          autoFocus
        />
        {invalid && (
          <p className="text-xs text-destructive">That code is invalid or has expired.</p>
        )}
      </div>
      <button
        type="button"
        disabled={code.length !== 6 || isVerifying || isResending}
        onClick={() => void verify()}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isVerifying ? (
          <LoadingSpinner
            label={
              purpose === "email" || purpose === "login"
                ? "Verifying email..."
                : "Verifying code..."
            }
          />
        ) : (
          "Verify code"
        )}
      </button>
      <button
        type="button"
        disabled={cooldown > 0 || isVerifying || isResending}
        onClick={() => void resend()}
        className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isResending ? (
          <span className="inline-flex items-center gap-2">
            <LoadingSpinner label="Sending code..." />
          </span>
        ) : cooldown > 0 ? (
          `Resend code in ${cooldown}s`
        ) : (
          "Resend code"
        )}
      </button>
    </div>
  );
}
