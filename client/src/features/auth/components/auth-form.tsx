import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { login, register } from "../api/auth.api";
import { loginSchema, registerSchema } from "../schemas/auth.schema";
import { useAuthStore } from "../store/auth.store";
import { PasswordInput } from "./password-input";
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api-error";

type Mode = "login" | "register";
export function AuthForm({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  const schema = mode === "login" ? loginSchema : registerSchema;
  type Values = { name?: string; email: string; password: string };
  const {
    register: field,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });
  const submit = async (values: Values) => {
    try {
      const response = await (mode === "login"
        ? login(values as { email: string; password: string })
        : register(values as { name: string; email: string; password: string }));
      setSession(response.data.user, response.data.accessToken);
      toast.success(mode === "login" ? "Welcome back" : "Your account is ready");
      navigate("/dashboard", { replace: true });
    } catch (error) {
      const fieldErrors = getApiFieldErrors(error);
      Object.entries(fieldErrors).forEach(([name, message]) => {
        if (name === "name" || name === "email" || name === "password") {
          setError(name, { type: "server", message });
        }
      });
      toast.error(getApiErrorMessage(error));
    }
  };
  return (
    <div className="w-full max-w-md space-y-8">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">FaultLine</p>
        <h2 className="font-serif text-4xl">
          {mode === "login" ? "Welcome back" : "Create your account"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {mode === "login" ? "Sign in to FaultLine" : "Get a clearer view of your services"}
        </p>
      </div>
      <form onSubmit={handleSubmit(submit)} className="space-y-5">
        {mode === "register" && (
          <Field label="Name" error={errors.name?.message}>
            <input {...field("name")} autoComplete="name" className="field" />
          </Field>
        )}
        <Field label="Email" error={errors.email?.message}>
          <input {...field("email")} type="email" autoComplete="email" className="field" />
        </Field>
        <Field label="Password" error={errors.password?.message}>
          <PasswordInput
            {...field("password")}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </Field>
        <button
          disabled={isSubmitting}
          className="w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        {mode === "login" ? "New to FaultLine?" : "Already have an account?"}{" "}
        <Link
          className="font-medium text-foreground underline-offset-4 hover:underline"
          to={mode === "login" ? "/register" : "/login"}
        >
          {mode === "login" ? "Create an account" : "Sign in"}
        </Link>
      </p>
    </div>
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
