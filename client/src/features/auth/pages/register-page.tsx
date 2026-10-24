import { AuthLayout } from "../components/auth-layout";
import { AuthForm } from "../components/auth-form";
export function RegisterPage() {
  return (
    <AuthLayout>
      <AuthForm mode="register" />
    </AuthLayout>
  );
}
