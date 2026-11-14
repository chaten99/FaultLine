import { create } from "zustand";
import { useWorkspaceStore } from "@/features/workspaces/store/workspace.store";
import type { User } from "../types/auth.types";

type AuthState = {
  user: User | null;
  accessToken: string | null;
  status: "loading" | "authenticated" | "unauthenticated";
  setSession: (user: User, accessToken: string) => void;
  setAccessToken: (accessToken: string) => void;
  updateUser: (patch: Partial<User>) => void;
  clearSession: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  status: "loading",
  setSession: (user, accessToken) => set({ user, accessToken, status: "authenticated" }),
  setAccessToken: (accessToken) => set({ accessToken }),
  updateUser: (patch) => set((state) => (state.user ? { user: { ...state.user, ...patch } } : {})),
  clearSession: () => {
    useWorkspaceStore.getState().setActiveWorkspace(null);
    useWorkspaceStore.getState().reset();
    set({ user: null, accessToken: null, status: "unauthenticated" });
  },
}));
