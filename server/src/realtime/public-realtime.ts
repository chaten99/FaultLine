import type { Namespace, Socket } from "socket.io";
import { PublicStatusPage } from "../modules/status-pages/status-page.model.js";
import { Workspace } from "../modules/workspaces/workspace.model.js";

export const publicRoom = (pageId: string): string => `page:${pageId}`;

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const maxSubscribeAttempts = 10;

type Ack = (response: { ok: boolean }) => void;

export const handlePublicSubscribe = async (
  socket: Pick<Socket, "join" | "leave" | "rooms" | "data">,
  payload: unknown,
  ack?: Ack,
): Promise<boolean> => {
  const reply = (ok: boolean) => {
    if (typeof ack === "function") ack({ ok });
    return ok;
  };
  const attempts = Number(socket.data.subscribeAttempts ?? 0) + 1;
  socket.data.subscribeAttempts = attempts;
  if (attempts > maxSubscribeAttempts) return reply(false);
  const slug = (payload as { slug?: unknown } | null)?.slug;
  if (typeof slug !== "string" || slug.length < 3 || slug.length > 48 || !slugPattern.test(slug)) {
    return reply(false);
  }
  const page = await PublicStatusPage.findOne({ slug, status: "published" })
    .select("_id workspaceId")
    .lean();
  if (!page) return reply(false);
  const workspace = await Workspace.findOne({ _id: page.workspaceId, status: "active" })
    .select("_id")
    .lean();
  if (!workspace) return reply(false);
  for (const room of socket.rooms) {
    if (room.startsWith("page:")) await socket.leave(room);
  }
  await socket.join(publicRoom(String(page._id)));
  return reply(true);
};

export const registerPublicNamespace = (namespace: Namespace): void => {
  namespace.on("connection", (socket) => {
    socket.on("subscribe", (payload: unknown, ack?: Ack) => {
      void handlePublicSubscribe(socket, payload, ack).catch(() => {
        if (typeof ack === "function") ack({ ok: false });
      });
    });
    socket.on("unsubscribe", async () => {
      for (const room of socket.rooms) {
        if (room.startsWith("page:")) await socket.leave(room);
      }
    });
  });
};

type DomainEvent = {
  type?: string;
  userId?: string;
  pageId?: string;
  payload?: Record<string, unknown>;
};

export const routePublicEvent = (
  namespace: Pick<Namespace, "to" | "in">,
  event: DomainEvent,
): boolean => {
  if (!event.type?.startsWith("public.")) return false;
  if (typeof event.pageId !== "string" || !/^[a-f\d]{24}$/i.test(event.pageId) || !event.payload) {
    return true;
  }
  const room = publicRoom(event.pageId);
  namespace.to(room).emit(event.type, event.payload);
  if (event.type === "public.page.unpublished") void namespace.in(room).socketsLeave(room);
  return true;
};
