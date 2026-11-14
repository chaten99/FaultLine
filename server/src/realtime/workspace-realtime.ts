import type { Server, Socket } from "socket.io";
import { resolveWorkspaceContext } from "../modules/workspaces/workspace-core.service.js";

export const workspaceRoom = (workspaceId: string): string => `workspace:${workspaceId}`;
export const userRoom = (userId: string): string => `user:${userId}`;

const maxSelectAttempts = 30;
const idPattern = /^[a-f\d]{24}$/i;

type Ack = (response: { ok: boolean }) => void;

export const selectWorkspace = async (
  socket: Pick<Socket, "join" | "leave" | "rooms" | "data">,
  payload: unknown,
  ack?: Ack,
): Promise<boolean> => {
  const reply = (ok: boolean) => {
    if (typeof ack === "function") ack({ ok });
    return ok;
  };
  const attempts = Number(socket.data.workspaceSelects ?? 0) + 1;
  socket.data.workspaceSelects = attempts;
  if (attempts > maxSelectAttempts) return reply(false);
  const workspaceId = (payload as { workspaceId?: unknown } | null)?.workspaceId;
  const userId = socket.data.userId as string | undefined;
  if (typeof workspaceId !== "string" || !idPattern.test(workspaceId) || !userId)
    return reply(false);
  const context = await resolveWorkspaceContext(userId, workspaceId);
  for (const room of socket.rooms) {
    if (room.startsWith("workspace:")) await socket.leave(room);
  }
  if (!context) {
    socket.data.workspaceId = undefined;
    return reply(false);
  }
  await socket.join(workspaceRoom(workspaceId));
  socket.data.workspaceId = workspaceId;
  return reply(true);
};

const roomPrefixes = ["monitor.check.", "incident.", "notification.", "workspace."];

type DomainEvent = {
  type?: string;
  userId?: string;
  workspaceId?: string;
  payload?: Record<string, unknown>;
};

export const routeWorkspaceEvent = (io: Pick<Server, "to" | "in">, event: DomainEvent): boolean => {
  const { type, payload } = event;
  if (!type || !payload) return false;

  if (type === "workspace.access_revoked" || type === "workspace.role_changed") {
    const targetWorkspace = payload.workspaceId;
    if (
      typeof event.userId !== "string" ||
      typeof targetWorkspace !== "string" ||
      !idPattern.test(targetWorkspace)
    ) {
      return true;
    }
    io.to(userRoom(event.userId)).emit(type, payload);
    if (type === "workspace.access_revoked") {
      void io.in(userRoom(event.userId)).socketsLeave(workspaceRoom(targetWorkspace));
    }
    return true;
  }

  if (
    typeof event.workspaceId === "string" &&
    roomPrefixes.some((prefix) => type.startsWith(prefix))
  ) {
    if (!idPattern.test(event.workspaceId)) return true;
    const room = workspaceRoom(event.workspaceId);
    io.to(room).emit(type, payload);
    if (type === "workspace.deleted") void io.in(room).socketsLeave(room);
    return true;
  }
  return false;
};
