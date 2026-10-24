import { AuthLayout } from "../components/auth-layout";
import { AuthForm } from "../components/auth-form";
export function LoginPage() {
  return (
    <AuthLayout>
      <AuthForm mode="login" />
    </AuthLayout>
  );
}
