import { Link } from "react-router-dom";
import { ArrowRight, Bell } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { IdentityCard } from "../components/identity-card";
import { PasswordForm } from "../components/password-form";
import { PersonalInfoForm } from "../components/personal-info-form";
import { ProfileSection } from "../components/profile-section";
import { SessionsSection } from "../components/sessions-section";
import { useProfile } from "../hooks/use-profile";

export function ProfilePage() {
  const profile = useProfile();

  return (
    <DashboardLayout>
      <div className="mx-auto min-w-0 max-w-4xl space-y-10">
        <div className="pf-rise space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Profile</h1>
          <p className="text-muted-foreground">
            Manage your personal information, security and sessions.
          </p>
        </div>

        <IdentityCard
          profile={profile.data}
          isLoading={profile.isLoading}
          isError={profile.isError}
          onRetry={() => void profile.refetch()}
        />

        <ProfileSection
          title="Personal information"
          description="Update how your name appears across FaultLine."
          index={1}
        >
          <PersonalInfoForm user={profile.data?.user} isLoading={profile.isLoading} />
        </ProfileSection>

        <ProfileSection
          title="Security"
          description="Use a strong password you don't use anywhere else."
          index={2}
        >
          <PasswordForm />
        </ProfileSection>

        <SessionsSection index={3} />

        <Link
          to="/settings/notifications"
          className="pf-rise pf-lift group flex items-center justify-between gap-4 rounded-lg border border-border bg-background p-4 sm:p-5"
          style={{ "--pf-i": 4 } as React.CSSProperties}
        >
          <span className="flex min-w-0 items-center gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
              <Bell className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block font-medium">Notification settings</span>
              <span className="block text-sm text-muted-foreground">
                Manage how FaultLine alerts you
              </span>
            </span>
          </span>
          <ArrowRight
            className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1"
            aria-hidden="true"
          />
        </Link>
      </div>
    </DashboardLayout>
  );
}
