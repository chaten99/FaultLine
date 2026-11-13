import { create } from "zustand";
import { activeWorkspaceStorageKey } from "../lib/switching";
import type { WorkspaceItem, WorkspaceRole } from "../types/workspace.types";

const readStoredId = (): string | null => {
  try {
    return window.localStorage.getItem(activeWorkspaceStorageKey);
  } catch {
    return null;
  }
};

const writeStoredId = (id: string | null) => {
  try {
    if (id) window.localStorage.setItem(activeWorkspaceStorageKey, id);
    else window.localStorage.removeItem(activeWorkspaceStorageKey);
  } catch {
    return;
  }
};

type WorkspaceState = {
  activeWorkspaceId: string | null;
  workspaces: WorkspaceItem[];
  loaded: boolean;
  setWorkspaces: (workspaces: WorkspaceItem[]) => void;
  setActiveWorkspace: (id: string | null) => void;
  reset: () => void;
};

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeWorkspaceId: null,
  workspaces: [],
  loaded: false,
  setWorkspaces: (workspaces) => set({ workspaces, loaded: true }),
  setActiveWorkspace: (id) => {
    writeStoredId(id);
    set({ activeWorkspaceId: id });
  },
  reset: () => set({ activeWorkspaceId: null, workspaces: [], loaded: false }),
}));

export const getStoredWorkspaceId = readStoredId;

export const selectActiveWorkspace = (state: WorkspaceState): WorkspaceItem | null =>
  state.workspaces.find((item) => item.id === state.activeWorkspaceId) ?? null;

export const selectActiveRole = (state: WorkspaceState): WorkspaceRole | null =>
  selectActiveWorkspace(state)?.role ?? null;
