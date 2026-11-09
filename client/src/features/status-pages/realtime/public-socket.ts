import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

const serverOrigin = () =>
  import.meta.env.VITE_API_BASE_URL?.replace(/\/api\/?$/, "") || window.location.origin;

export const getPublicSocket = (): Socket => {
  if (!socket) {
    socket = io(`${serverOrigin()}/public`, {
      path: "/socket.io",
      autoConnect: false,
      withCredentials: false,
      reconnectionDelayMax: 15_000,
    });
  }
  return socket;
};

export const disconnectPublicSocket = () => {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
};
