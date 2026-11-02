import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "@/features/auth/store/auth.store";

let socket: Socket | null = null;

export const getMonitorSocket = (): Socket => {
  if (!socket) {
    socket = io(
      import.meta.env.VITE_API_BASE_URL?.replace(/\/api\/?$/, "") || window.location.origin,
      {
        path: "/socket.io",
        autoConnect: false,
        withCredentials: true,
        auth: (callback) => callback({ token: useAuthStore.getState().accessToken }),
      },
    );
  }
  return socket;
};

export const disconnectMonitorSocket = () => {
  socket?.disconnect();
};
