import mongoose, { Types } from "mongoose";
import { createApiError } from "../../lib/errors/create-api-error.js";
import { User } from "../auth/user.model.js";
import { Incident } from "../incidents/incident.model.js";
import { Monitor } from "../monitors/monitor.model.js";
import { listUserWorkspaceIds } from "../workspaces/workspace-core.service.js";

const toProfileUser = (user: {
  _id: unknown;
  name: string;
  email: string;
  emailVerifiedAt?: Date | null;
  createdAt?: Date;
}) => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  emailVerified: Boolean(user.emailVerifiedAt),
  createdAt: new Date(user.createdAt ?? Date.now()).toISOString(),
});

const countStatusPages = async (workspaceIds: Types.ObjectId[]): Promise<number> => {
  if (mongoose.connection.readyState !== 1 || workspaceIds.length === 0) return 0;
  try {
    return await mongoose.connection
      .collection("publicstatuspages")
      .countDocuments({ workspaceId: { $in: workspaceIds } });
  } catch {
    return 0;
  }
};

export const getProfile = async (userId: string) => {
  const user = await User.findById(userId).lean();
  if (!user) throw createApiError("Authentication required.", 401, "AUTHENTICATION_REQUIRED");
  const workspaceIds = (await listUserWorkspaceIds(userId)).map((id) => new Types.ObjectId(id));
  const scope = { workspaceId: { $in: workspaceIds } };
  const [monitors, activeMonitors, openIncidents, statusPages] = await Promise.all([
    Monitor.countDocuments(scope),
    Monitor.countDocuments({ ...scope, active: true }),
    Incident.countDocuments({ ...scope, status: { $in: ["open", "acknowledged"] } }),
    countStatusPages(workspaceIds),
  ]);
  return {
    user: toProfileUser(user),
    stats: { monitors, activeMonitors, openIncidents, statusPages },
  };
};

export const updateProfile = async (userId: string, input: { name: string }) => {
  const updated = await User.findOneAndUpdate(
    { _id: new Types.ObjectId(userId) },
    { $set: { name: input.name } },
    { new: true },
  ).lean();
  if (!updated) throw createApiError("Authentication required.", 401, "AUTHENTICATION_REQUIRED");
  return { user: toProfileUser(updated) };
};
