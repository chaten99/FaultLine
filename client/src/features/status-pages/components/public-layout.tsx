export function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">{children}</main>
      <footer className="border-t border-border px-4 py-6 text-center text-xs text-muted-foreground">
        Powered by <span className="font-semibold text-foreground">FaultLine</span>
      </footer>
    </div>
  );
}

export function PublicMessage({
  title,
  children,
  role,
}: {
  title: string;
  children?: React.ReactNode;
  role?: "alert" | "status";
}) {
  return (
    <PublicLayout>
      <div role={role} className="mx-auto max-w-md space-y-3 py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {children ? (
          <div className="space-y-4 text-sm text-muted-foreground">{children}</div>
        ) : null}
      </div>
    </PublicLayout>
  );
}
