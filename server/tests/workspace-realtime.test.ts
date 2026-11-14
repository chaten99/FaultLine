import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  routeWorkspaceEvent,
  selectWorkspace,
  userRoom,
  workspaceRoom,
} from "../src/realtime/workspace-realtime.js";
import {
  bindWorkspaceModels,
  resetWorkspaceModels,
  seedWorkspace,
} from "./helpers/workspace-fixtures.js";

const stores = bindWorkspaceModels();
const owner = new Types.ObjectId();
const member = new Types.ObjectId();
const outsider = new Types.ObjectId();
let workspaceId: Types.ObjectId;
let otherWorkspace: Types.ObjectId;

const fakeSocket = (userId: Types.ObjectId, rooms: string[] = ["socket-id"]) => ({
  rooms: new Set(rooms),
  data: { userId: String(userId) } as Record<string, unknown>,
  join: vi.fn(async function (this: unknown, room: string) {
    void room;
  }),
  leave: vi.fn(async () => undefined),
});

beforeEach(() => {
  resetWorkspaceModels(stores);
  workspaceId = seedWorkspace(stores, {
    ownerId: owner,
    members: [{ userId: member, role: "viewer" }],
  });
  otherWorkspace = seedWorkspace(stores, {
    ownerId: outsider,
    members: [{ userId: member, role: "member" }],
  });
});

describe("workspace room selection", () => {
  it("joins the room only after the server verifies active membership", async () => {
    const socket = fakeSocket(member);
    const ack = vi.fn();
    expect(await selectWorkspace(socket as never, { workspaceId: String(workspaceId) }, ack)).toBe(
      true,
    );
    expect(socket.join).toHaveBeenCalledWith(workspaceRoom(String(workspaceId)));
    expect(ack).toHaveBeenCalledWith({ ok: true });
    expect(socket.data.workspaceId).toBe(String(workspaceId));
  });

  it("refuses non-members, removed members, deleted workspaces and malformed ids", async () => {
    const cases: Array<() => Promise<boolean>> = [
      () => selectWorkspace(fakeSocket(outsider) as never, { workspaceId: String(workspaceId) }),
      () => {
        stores.members.docs.find(
          (doc) =>
            String(doc.userId) === String(member) &&
            String(doc.workspaceId) === String(workspaceId),
        )!.status = "removed";
        return selectWorkspace(fakeSocket(member) as never, { workspaceId: String(workspaceId) });
      },
      () => {
        stores.workspaces.docs.find((doc) => String(doc._id) === String(otherWorkspace))!.status =
          "deleted";
        return selectWorkspace(fakeSocket(member) as never, {
          workspaceId: String(otherWorkspace),
        });
      },
      () => selectWorkspace(fakeSocket(member) as never, { workspaceId: "../etc" }),
      () => selectWorkspace(fakeSocket(member) as never, { workspaceId: { $ne: null } }),
      () => selectWorkspace(fakeSocket(member) as never, null),
    ];
    for (const run of cases) expect(await run()).toBe(false);
  });

  it("never joins when the client-supplied room name is not a workspace id", async () => {
    const socket = fakeSocket(member);
    await selectWorkspace(socket as never, { workspaceId: `user:${String(owner)}` });
    await selectWorkspace(socket as never, { room: workspaceRoom(String(workspaceId)) });
    expect(socket.join).not.toHaveBeenCalled();
  });

  it("leaves the previous workspace room when switching and when access is lost", async () => {
    const socket = fakeSocket(member, ["socket-id", workspaceRoom(String(workspaceId))]);
    await selectWorkspace(socket as never, { workspaceId: String(otherWorkspace) });
    expect(socket.leave).toHaveBeenCalledWith(workspaceRoom(String(workspaceId)));
    expect(socket.join).toHaveBeenCalledWith(workspaceRoom(String(otherWorkspace)));

    const revoked = fakeSocket(member, ["socket-id", workspaceRoom(String(otherWorkspace))]);
    stores.members.docs.find(
      (doc) =>
        String(doc.userId) === String(member) && String(doc.workspaceId) === String(otherWorkspace),
    )!.status = "removed";
    expect(await selectWorkspace(revoked as never, { workspaceId: String(otherWorkspace) })).toBe(
      false,
    );
    expect(revoked.leave).toHaveBeenCalledWith(workspaceRoom(String(otherWorkspace)));
    expect(revoked.data.workspaceId).toBeUndefined();
  });

  it("limits repeated selection attempts per connection", async () => {
    const socket = fakeSocket(member);
    const results: boolean[] = [];
    for (let attempt = 0; attempt < 32; attempt += 1) {
      results.push(await selectWorkspace(socket as never, { workspaceId: String(workspaceId) }));
    }
    expect(results.slice(0, 30).every(Boolean)).toBe(true);
    expect(results.slice(30)).toEqual([false, false]);
  });

  it("allows a reconnecting client to select again", async () => {
    await selectWorkspace(fakeSocket(member) as never, { workspaceId: String(workspaceId) });
    const reconnected = fakeSocket(member);
    expect(await selectWorkspace(reconnected as never, { workspaceId: String(workspaceId) })).toBe(
      true,
    );
  });
});

describe("routing workspace events", () => {
  const makeIo = () => {
    const emit = vi.fn();
    const socketsLeave = vi.fn();
    return {
      emit,
      socketsLeave,
      io: { to: vi.fn(() => ({ emit })), in: vi.fn(() => ({ socketsLeave })) },
    };
  };

  it("emits resource and team events only to the matching workspace room", () => {
    const { io, emit } = makeIo();
    for (const type of [
      "monitor.check.completed",
      "incident.created",
      "notification.delivery_updated",
      "workspace.member.invited",
    ]) {
      expect(
        routeWorkspaceEvent(io as never, {
          type,
          workspaceId: String(workspaceId),
          payload: { ok: true },
        }),
      ).toBe(true);
    }
    expect(io.to).toHaveBeenCalledTimes(4);
    expect(
      io.to.mock.calls.every(
        (call) => (call as unknown as string[])[0] === workspaceRoom(String(workspaceId)),
      ),
    ).toBe(true);
    expect(emit).toHaveBeenCalledTimes(4);
  });

  it("never emits legacy user-scoped resource events or unknown event types", () => {
    const { io, emit } = makeIo();
    expect(
      routeWorkspaceEvent(io as never, {
        type: "incident.created",
        userId: String(owner),
        payload: { monitorName: "x" },
      }),
    ).toBe(false);
    expect(
      routeWorkspaceEvent(io as never, {
        type: "secrets.leaked",
        workspaceId: String(workspaceId),
        payload: {},
      }),
    ).toBe(false);
    expect(
      routeWorkspaceEvent(io as never, {
        type: "monitor.check.completed",
        workspaceId: String(workspaceId),
      }),
    ).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });

  it("drops events with malformed workspace ids", () => {
    const { io, emit } = makeIo();
    routeWorkspaceEvent(io as never, {
      type: "incident.created",
      workspaceId: "../x",
      payload: {},
    });
    expect(emit).not.toHaveBeenCalled();
  });

  it("revokes a user's workspace room immediately when access is revoked", () => {
    const { io, emit, socketsLeave } = makeIo();
    routeWorkspaceEvent(io as never, {
      type: "workspace.access_revoked",
      userId: String(member),
      payload: { workspaceId: String(workspaceId) },
    });
    expect(io.to).toHaveBeenCalledWith(userRoom(String(member)));
    expect(emit).toHaveBeenCalledWith("workspace.access_revoked", {
      workspaceId: String(workspaceId),
    });
    expect(io.in).toHaveBeenCalledWith(userRoom(String(member)));
    expect(socketsLeave).toHaveBeenCalledWith(workspaceRoom(String(workspaceId)));
  });

  it("notifies role changes only to the affected user without altering rooms", () => {
    const { io, emit, socketsLeave } = makeIo();
    routeWorkspaceEvent(io as never, {
      type: "workspace.role_changed",
      userId: String(member),
      payload: { workspaceId: String(workspaceId), role: "admin" },
    });
    expect(emit).toHaveBeenCalledWith("workspace.role_changed", {
      workspaceId: String(workspaceId),
      role: "admin",
    });
    expect(socketsLeave).not.toHaveBeenCalled();
  });

  it("clears the whole room when a workspace is deleted", () => {
    const { io, socketsLeave } = makeIo();
    routeWorkspaceEvent(io as never, {
      type: "workspace.deleted",
      workspaceId: String(workspaceId),
      payload: { workspaceId: String(workspaceId) },
    });
    expect(socketsLeave).toHaveBeenCalledWith(workspaceRoom(String(workspaceId)));
  });

  it("ignores user events with missing targets", () => {
    const { io, emit } = makeIo();
    expect(
      routeWorkspaceEvent(io as never, {
        type: "workspace.access_revoked",
        payload: { workspaceId: String(workspaceId) },
      }),
    ).toBe(true);
    expect(
      routeWorkspaceEvent(io as never, {
        type: "workspace.access_revoked",
        userId: String(member),
        payload: {},
      }),
    ).toBe(true);
    expect(emit).not.toHaveBeenCalled();
  });
});
