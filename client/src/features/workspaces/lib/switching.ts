import type { WorkspaceItem } from "../types/workspace.types";

export const activeWorkspaceStorageKey = "faultline.activeWorkspace";

export const pickActiveWorkspace = (
  workspaces: WorkspaceItem[],
  preferredId: string | null | undefined,
): WorkspaceItem | null => {
  if (workspaces.length === 0) return null;
  const preferred = preferredId ? workspaces.find((item) => item.id === preferredId) : undefined;
  if (preferred) return preferred;
  return workspaces.find((item) => item.type === "personal") ?? workspaces[0] ?? null;
};

export type SwitchPlan = {
  changed: boolean;
  cancelQueries: boolean;
  clearCache: boolean;
  persist: string;
  emitSelect: boolean;
  remount: boolean;
};

export const planWorkspaceSwitch = (
  currentId: string | null,
  nextId: string,
  workspaces: WorkspaceItem[],
): SwitchPlan | null => {
  if (!workspaces.some((item) => item.id === nextId)) return null;
  const changed = currentId !== nextId;
  return {
    changed,
    cancelQueries: changed,
    clearCache: changed,
    persist: nextId,
    emitSelect: true,
    remount: changed,
  };
};

export const shouldSendWorkspaceHeader = (url: string | undefined): boolean => {
  if (!url) return false;
  const path = url.split("?")[0] ?? "";
  return !/^\/?(auth|profile|invitations)(\/|$)/.test(path);
};
