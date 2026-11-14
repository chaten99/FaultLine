import { useEffect } from "react";
import { PageLoader } from "@/components/common/page-loader";
import { Button } from "@/components/ui/button";
import { useRecoverFromLostWorkspace, useWorkspacesQuery } from "../hooks/use-workspaces";
import { onWorkspaceAccessLost } from "../lib/workspace-bus";
import { pickActiveWorkspace } from "../lib/switching";
import { getStoredWorkspaceId, useWorkspaceStore } from "../store/workspace.store";

export function WorkspaceGate({ children }: { children: React.ReactNode }) {
  const query = useWorkspacesQuery();
  const activeId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const setWorkspaces = useWorkspaceStore((state) => state.setWorkspaces);
  const setActive = useWorkspaceStore((state) => state.setActiveWorkspace);
  const recover = useRecoverFromLostWorkspace();

  useEffect(() => {
    if (!query.data) return;
    setWorkspaces(query.data);
    const current = useWorkspaceStore.getState().activeWorkspaceId;
    if (!current || !query.data.some((item) => item.id === current)) {
      const next = pickActiveWorkspace(query.data, current ?? getStoredWorkspaceId());
      if (next) setActive(next.id);
    }
  }, [query.data, setActive, setWorkspaces]);

  useEffect(() => onWorkspaceAccessLost(() => void recover()), [recover]);

  if (query.isError && !activeId) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-6 text-center">
        <div className="max-w-sm space-y-4">
          <h1 className="text-lg font-semibold">We couldn't load your workspaces</h1>
          <p className="text-sm text-muted-foreground">Check your connection and try again.</p>
          <Button onClick={() => void query.refetch()}>Try again</Button>
        </div>
      </main>
    );
  }

  if (!activeId) return <PageLoader />;
  return <>{children}</>;
}
