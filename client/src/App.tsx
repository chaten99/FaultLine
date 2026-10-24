import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";

type HealthResponse = {
  status: string;
  service: string;
  timestamp: string;
  uptimeSeconds: number;
};

export default function App() {
  const [result, setResult] = useState<HealthResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const checkHealth = async () => {
    setIsLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await apiClient.get<HealthResponse>("/health");
      setResult(response.data);
    } catch {
      setError("The server health check could not be completed.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <section className="w-full max-w-xl space-y-8 rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-400">
            FaultLine
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">
            API Monitoring &amp; Incident Response
          </h1>
          <p className="text-slate-400">
            A dependable foundation for understanding API health in real time.
          </p>
        </div>
        <Button type="button" onClick={checkHealth} disabled={isLoading} aria-busy={isLoading}>
          {isLoading ? "Checking server health..." : "Check server health"}
        </Button>
        <div className="min-h-16 text-sm" aria-live="polite">
          {isLoading && <p className="text-slate-400">Contacting the FaultLine API...</p>}
          {result && (
            <p className="text-emerald-400">
              Server is {result.status}. Uptime: {result.uptimeSeconds}s.
            </p>
          )}
          {error && <p className="text-rose-400">{error}</p>}
        </div>
      </section>
    </main>
  );
}
