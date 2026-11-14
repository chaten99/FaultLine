import crypto from "node:crypto";
import { Types } from "mongoose";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { sendNotificationEmail } from "../../lib/email/email.service.js";
import { renderInvitationEmail } from "../../lib/email/workspace-email-template.service.js";
import { createApiError } from "../../lib/errors/create-api-error.js";
import { publishDomainEvent } from "../../lib/redis/redis.service.js";
import { User } from "../auth/user.model.js";
import { recordAudit } from "./workspace-core.service.js";
import { WorkspaceInvitation, type IWorkspaceInvitation } from "./workspace-invitation.model.js";
import { WorkspaceMember } from "./workspace-member.model.js";
import { Workspace, type IWorkspace } from "./workspace.model.js";
import type { AssignableRole, WorkspaceContext } from "./workspace.types.js";

const resendCooldownMs = 60_000;
const maxPendingInvitations = 100;

export const generateInvitationToken = (): string => crypto.randomBytes(32).toString("base64url");

export const hashInvitationToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

const invalid = () =>
  createApiError("This invitation is invalid or has expired.", 400, "INVITATION_INVALID");

export const maskEmail = (email: string): string => {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}${"*".repeat(Math.max(2, Math.min(local.length - 1, 6)))}@${domain}`;
};

const acceptUrlFor = (token: string): string =>
  `${env.APP_ORIGIN.replace(/\/+$/, "")}/invitations/accept?token=${token}`;

const expiryFromNow = () => new Date(Date.now() + env.WORKSPACE_INVITATION_TTL_DAYS * 86_400_000);

const isExpired = (invitation: Pick<IWorkspaceInvitation, "status" | "expiresAt">) =>
  invitation.status === "pending" && new Date(invitation.expiresAt).getTime() <= Date.now();

const displayStatus = (invitation: Pick<IWorkspaceInvitation, "status" | "expiresAt">) =>
  isExpired(invitation) ? ("expired" as const) : invitation.status;

const sendInvitationEmail = async (input: {
  workspaceName: string;
  inviterId: string;
  role: AssignableRole;
  email: string;
  message?: string;
  token: string;
}) => {
  try {
    const inviter = await User.findById(input.inviterId).select("name").lean();
    const rendered = await renderInvitationEmail({
      workspaceName: input.workspaceName,
      inviterName: inviter?.name ?? "A teammate",
      role: input.role,
      email: input.email,
      message: input.message,
      acceptUrl: acceptUrlFor(input.token),
      expiryDays: env.WORKSPACE_INVITATION_TTL_DAYS,
    });
    const result = await sendNotificationEmail({
      to: input.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    if (!result.ok)
      logger.warn({ category: result.category }, "Invitation email was not delivered");
  } catch (error) {
    logger.warn({ err: error }, "Invitation email failed");
  }
};

const present = async (invitations: IWorkspaceInvitation[]) => {
  const inviters = await User.find({
    _id: { $in: invitations.map((invitation) => invitation.invitedBy) },
  })
    .select("name")
    .lean();
  const byId = new Map(inviters.map((user) => [String(user._id), user.name]));
  return invitations.map((invitation) => ({
    id: String(invitation._id),
    email: invitation.email,
    role: invitation.role,
    status: displayStatus(invitation),
    invitedBy: {
      id: String(invitation.invitedBy),
      name: byId.get(String(invitation.invitedBy)) ?? "Unknown user",
    },
    message: invitation.message ?? null,
    createdAt: new Date(invitation.createdAt).toISOString(),
    lastSentAt: new Date(invitation.lastSentAt).toISOString(),
    expiresAt: new Date(invitation.expiresAt).toISOString(),
  }));
};

const loadWorkspace = async (workspaceId: string) => {
  const workspace = await Workspace.findOne({ _id: workspaceId, status: "active" }).lean();
  if (!workspace) throw createApiError("Workspace not found.", 404, "WORKSPACE_NOT_FOUND");
  return workspace as unknown as IWorkspace;
};

export const listInvitations = async (
  ctx: WorkspaceContext,
  status: "pending" | "expired" | "all",
) => {
  const rows = (await WorkspaceInvitation.find({ workspaceId: new Types.ObjectId(ctx.workspaceId) })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean()) as unknown as IWorkspaceInvitation[];
  const filtered = rows.filter((row) => {
    const state = displayStatus(row);
    if (status === "all") return true;
    return state === status;
  });
  return { items: await present(filtered) };
};

export const createInvitation = async (
  ctx: WorkspaceContext,
  input: { email: string; role: AssignableRole; message?: string },
) => {
  const workspace = await loadWorkspace(ctx.workspaceId);
  const existingUser = await User.findOne({ email: input.email }).select("_id").lean();
  if (existingUser) {
    const membership = await WorkspaceMember.findOne({
      workspaceId: workspace._id,
      userId: existingUser._id,
      status: "active",
    }).lean();
    if (membership) {
      throw createApiError("That person is already a member.", 409, "ALREADY_MEMBER", {
        email: "This person is already a member of the workspace.",
      });
    }
  }
  const pending = await WorkspaceInvitation.findOne({
    workspaceId: workspace._id,
    email: input.email,
    status: "pending",
  });
  if (pending && !isExpired(pending as unknown as IWorkspaceInvitation)) {
    throw createApiError(
      "An invitation is already pending for this email. Resend or revoke it instead.",
      409,
      "INVITATION_EXISTS",
      { email: "An invitation is already pending for this email." },
      { invitationId: String(pending._id) },
    );
  }
  const total = await WorkspaceInvitation.countDocuments({
    workspaceId: workspace._id,
    status: "pending",
  });
  if (!pending && total >= maxPendingInvitations) {
    throw createApiError(
      "Too many pending invitations. Revoke some first.",
      409,
      "INVITATION_EXISTS",
    );
  }
  const token = generateInvitationToken();
  const now = new Date();
  let invitation: IWorkspaceInvitation;
  if (pending) {
    const refreshed = await WorkspaceInvitation.findOneAndUpdate(
      { _id: pending._id, status: "pending" },
      {
        $set: {
          role: input.role,
          message: input.message ?? undefined,
          invitedBy: new Types.ObjectId(ctx.userId),
          tokenHash: hashInvitationToken(token),
          expiresAt: expiryFromNow(),
          lastSentAt: now,
        },
        $inc: { sendCount: 1 },
      },
      { new: true },
    );
    if (!refreshed) throw invalid();
    invitation = refreshed as unknown as IWorkspaceInvitation;
  } else {
    try {
      invitation = (await WorkspaceInvitation.create({
        workspaceId: workspace._id,
        email: input.email,
        role: input.role,
        invitedBy: new Types.ObjectId(ctx.userId),
        message: input.message,
        tokenHash: hashInvitationToken(token),
        status: "pending",
        expiresAt: expiryFromNow(),
        lastSentAt: now,
        sendCount: 1,
      })) as unknown as IWorkspaceInvitation;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        throw createApiError(
          "An invitation is already pending for this email. Resend or revoke it instead.",
          409,
          "INVITATION_EXISTS",
          { email: "An invitation is already pending for this email." },
        );
      }
      throw error;
    }
  }
  await recordAudit({
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    type: "member.invited",
    metadata: { email: input.email, role: input.role },
  });
  await publishDomainEvent("workspace.member.invited", {
    workspaceId: ctx.workspaceId,
    payload: { workspaceId: ctx.workspaceId, invitationId: String(invitation._id) },
  });
  void sendInvitationEmail({
    workspaceName: workspace.name,
    inviterId: ctx.userId,
    role: input.role,
    email: input.email,
    message: input.message,
    token,
  });
  const [view] = await present([invitation]);
  return { invitation: view };
};

const loadPending = async (ctx: WorkspaceContext, invitationId: string) => {
  if (!Types.ObjectId.isValid(invitationId)) {
    throw createApiError("Invitation not found.", 404, "INVITATION_INVALID");
  }
  const invitation = await WorkspaceInvitation.findOne({
    _id: invitationId,
    workspaceId: new Types.ObjectId(ctx.workspaceId),
    status: "pending",
  });
  if (!invitation) throw createApiError("Invitation not found.", 404, "INVITATION_INVALID");
  return invitation as unknown as IWorkspaceInvitation;
};

export const resendInvitation = async (ctx: WorkspaceContext, invitationId: string) => {
  const workspace = await loadWorkspace(ctx.workspaceId);
  const invitation = await loadPending(ctx, invitationId);
  if (Date.now() - new Date(invitation.lastSentAt).getTime() < resendCooldownMs) {
    throw createApiError(
      "Please wait a minute before resending this invitation.",
      429,
      "RATE_LIMITED",
    );
  }
  const token = generateInvitationToken();
  const updated = await WorkspaceInvitation.findOneAndUpdate(
    { _id: invitation._id, status: "pending" },
    {
      $set: {
        tokenHash: hashInvitationToken(token),
        expiresAt: expiryFromNow(),
        lastSentAt: new Date(),
      },
      $inc: { sendCount: 1 },
    },
    { new: true },
  );
  if (!updated) throw createApiError("Invitation not found.", 404, "INVITATION_INVALID");
  await recordAudit({
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    type: "member.invitation_resent",
    metadata: { email: invitation.email },
  });
  void sendInvitationEmail({
    workspaceName: workspace.name,
    inviterId: ctx.userId,
    role: invitation.role,
    email: invitation.email,
    message: invitation.message,
    token,
  });
  const [view] = await present([updated as unknown as IWorkspaceInvitation]);
  return { invitation: view };
};

export const revokeInvitation = async (ctx: WorkspaceContext, invitationId: string) => {
  const invitation = await loadPending(ctx, invitationId);
  const revoked = await WorkspaceInvitation.findOneAndUpdate(
    { _id: invitation._id, status: "pending" },
    { $set: { status: "revoked", revokedAt: new Date() } },
    { new: true },
  );
  if (!revoked) throw createApiError("Invitation not found.", 404, "INVITATION_INVALID");
  await recordAudit({
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    type: "member.invitation_revoked",
    metadata: { email: invitation.email },
  });
  await publishDomainEvent("workspace.invitation.revoked", {
    workspaceId: ctx.workspaceId,
    payload: { workspaceId: ctx.workspaceId, invitationId: String(invitation._id) },
  });
  const [view] = await present([revoked as unknown as IWorkspaceInvitation]);
  return { invitation: view };
};

const findByToken = async (token: string) => {
  const invitation = await WorkspaceInvitation.findOne({
    tokenHash: hashInvitationToken(token),
  }).select("+tokenHash");
  return invitation as unknown as IWorkspaceInvitation | null;
};

export const validateInvitation = async (token: string) => {
  const invitation = await findByToken(token);
  if (!invitation || invitation.status !== "pending" || isExpired(invitation)) throw invalid();
  const workspace = await Workspace.findOne({
    _id: invitation.workspaceId,
    status: "active",
  }).lean();
  if (!workspace) throw invalid();
  const inviter = await User.findById(invitation.invitedBy).select("name").lean();
  return {
    workspaceName: workspace.name,
    inviterName: inviter?.name ?? "A teammate",
    role: invitation.role,
    emailMasked: maskEmail(invitation.email),
    expiresAt: new Date(invitation.expiresAt).toISOString(),
  };
};

const activateMembership = async (
  invitation: IWorkspaceInvitation,
  userId: string,
): Promise<{ role: string; alreadyMember: boolean }> => {
  const existing = await WorkspaceMember.findOne({
    workspaceId: invitation.workspaceId,
    userId: new Types.ObjectId(userId),
  }).lean();
  if (existing && existing.status === "active") {
    return { role: existing.role, alreadyMember: true };
  }
  const activate = () =>
    WorkspaceMember.updateOne(
      { workspaceId: invitation.workspaceId, userId: new Types.ObjectId(userId) },
      {
        $set: {
          role: invitation.role,
          status: "active",
          invitedBy: invitation.invitedBy,
          joinedAt: new Date(),
        },
        $unset: { removedAt: "" },
      },
      { upsert: true },
    );
  try {
    await activate();
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    await activate();
  }
  return { role: invitation.role, alreadyMember: false };
};

export const acceptInvitation = async (userId: string, token: string) => {
  const user = await User.findById(userId).select("email emailVerifiedAt").lean();
  if (!user) throw createApiError("Authentication required.", 401, "AUTHENTICATION_REQUIRED");
  const invitation = await findByToken(token);
  if (!invitation) throw invalid();
  const workspace = await Workspace.findOne({
    _id: invitation.workspaceId,
    status: "active",
  }).lean();
  if (!workspace) throw invalid();

  const recoverable = invitation.status === "accepted" && String(invitation.acceptedBy) === userId;
  if (!recoverable && (invitation.status !== "pending" || isExpired(invitation))) throw invalid();
  if (!user.emailVerifiedAt) {
    throw createApiError("Verify your email address before accepting.", 403, "EMAIL_NOT_VERIFIED");
  }
  if (user.email.toLowerCase() !== invitation.email) {
    throw createApiError(
      "This invitation was sent to a different email address.",
      403,
      "EMAIL_MISMATCH",
      undefined,
      { expectedEmailMasked: maskEmail(invitation.email) },
    );
  }

  let wonRace = false;
  if (!recoverable) {
    const consumed = await WorkspaceInvitation.findOneAndUpdate(
      {
        _id: invitation._id,
        status: "pending",
        expiresAt: { $gt: new Date() },
      },
      {
        $set: {
          status: "accepted",
          acceptedAt: new Date(),
          acceptedBy: new Types.ObjectId(userId),
        },
      },
      { new: true },
    );
    if (!consumed) {
      const latest = await WorkspaceInvitation.findById(invitation._id);
      if (!latest || String(latest.acceptedBy) !== userId) throw invalid();
    } else {
      wonRace = true;
    }
  }

  const membership = await activateMembership(invitation, userId);
  if (wonRace && !membership.alreadyMember) {
    await recordAudit({
      workspaceId: String(invitation.workspaceId),
      actorId: userId,
      type: "member.invitation_accepted",
      targetUserId: userId,
      metadata: { role: invitation.role },
    });
    await publishDomainEvent("workspace.member.accepted", {
      workspaceId: String(invitation.workspaceId),
      payload: { workspaceId: String(invitation.workspaceId), userId },
    });
  }
  return {
    workspaceId: String(invitation.workspaceId),
    role: membership.role,
    alreadyMember: membership.alreadyMember,
  };
};
