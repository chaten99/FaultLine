import mongoose, { Types } from "mongoose";
import { createApiError } from "../../lib/errors/create-api-error.js";
import { User } from "../auth/user.model.js";
import { Incident } from "../incidents/incident.model.js";
import { Monitor } from "../monitors/monitor.model.js";

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

const countStatusPages = async (userId: string): Promise<number> => {
  if (mongoose.connection.readyState !== 1) return 0;
  try {
    return await mongoose.connection
      .collection("publicstatuspages")
      .countDocuments({ ownerId: new Types.ObjectId(userId) });
  } catch {
    return 0;
  }
};

export const getProfile = async (userId: string) => {
  const user = await User.findById(userId).lean();
  if (!user) throw createApiError("Authentication required.", 401, "AUTHENTICATION_REQUIRED");
  const owner = new Types.ObjectId(userId);
  const [monitors, activeMonitors, openIncidents, statusPages] = await Promise.all([
    Monitor.countDocuments({ userId: owner }),
    Monitor.countDocuments({ userId: owner, active: true }),
    Incident.countDocuments({ userId: owner, status: { $in: ["open", "acknowledged"] } }),
    countStatusPages(userId),
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
