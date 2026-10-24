import { LoadingSpinner } from "./loading-spinner";

export function PageLoader() {
  return (
    <main className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
      <LoadingSpinner label="Loading FaultLine" />
    </main>
  );
}
