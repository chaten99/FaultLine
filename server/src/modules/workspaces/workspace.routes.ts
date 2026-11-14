import type { Request, Response } from "express";
import { Router } from "express";
import { createApiError } from "../../lib/errors/create-api-error.js";
import { rateLimit } from "../../lib/rate-limit.js";
import { authenticate } from "../../middleware/authenticate.js";
import { listAuditEvents } from "./audit.service.js";
import {
  acceptInvitation,
  createInvitation,
  listInvitations,
  resendInvitation,
  revokeInvitation,
  validateInvitation,
} from "./invitation.service.js";
import { changeMemberRole, listMembers, removeMember } from "./member.service.js";
import { withWorkspaceParam, workspaceOf } from "./workspace-context.js";
import {
  createWorkspace,
  deleteWorkspace,
  getWorkspace,
  leaveWorkspace,
  listWorkspaces,
  transferOwnership,
  updateWorkspace,
} from "./workspace.service.js";
import {
  acceptInvitationSchema,
  auditQuerySchema,
  changeRoleSchema,
  createWorkspaceSchema,
  deleteWorkspaceSchema,
  inviteSchema,
  invitationParamSchema,
  listInvitationsSchema,
  memberParamSchema,
  transferOwnershipSchema,
  updateWorkspaceSchema,
  validateInvitationSchema,
} from "./workspace.validation.js";
import type { WorkspaceRequest } from "./workspace.types.js";

const userOf = (request: Request): string => {
  const id = (request as WorkspaceRequest).userId;
  if (!id) throw createApiError("Authentication required.", 401, "AUTHENTICATION_REQUIRED");
  return id;
};

const noStore = (response: Response) => response.setHeader("Cache-Control", "private, no-store");

export const workspaceRouter = Router();
const mutate = rateLimit("workspace:mutate", 60, 60);
const sensitive = rateLimit("workspace:sensitive", 5, 900);
const invite = rateLimit("workspace:invite", 20, 3600);
const resend = rateLimit("workspace:invite-resend", 10, 3600);

workspaceRouter.get("/", authenticate, async (request: Request, response: Response) => {
  noStore(response);
  return response.json(await listWorkspaces(userOf(request)));
});

workspaceRouter.post("/", authenticate, mutate, async (request: Request, response: Response) =>
  response
    .status(201)
    .json(await createWorkspace(userOf(request), createWorkspaceSchema.parse(request.body))),
);

workspaceRouter.get(
  "/:workspaceId",
  ...withWorkspaceParam("workspace:view"),
  async (request: Request, response: Response) => {
    noStore(response);
    return response.json(await getWorkspace(workspaceOf(request)));
  },
);

workspaceRouter.patch(
  "/:workspaceId",
  ...withWorkspaceParam("workspace:manage_settings"),
  mutate,
  async (request: Request, response: Response) =>
    response.json(
      await updateWorkspace(workspaceOf(request), updateWorkspaceSchema.parse(request.body)),
    ),
);

workspaceRouter.delete(
  "/:workspaceId",
  ...withWorkspaceParam("workspace:delete"),
  sensitive,
  async (request: Request, response: Response) =>
    response.json(
      await deleteWorkspace(workspaceOf(request), deleteWorkspaceSchema.parse(request.body)),
    ),
);

workspaceRouter.post(
  "/:workspaceId/transfer-ownership",
  ...withWorkspaceParam("workspace:transfer"),
  sensitive,
  async (request: Request, response: Response) =>
    response.json(
      await transferOwnership(workspaceOf(request), transferOwnershipSchema.parse(request.body)),
    ),
);

workspaceRouter.post(
  "/:workspaceId/leave",
  ...withWorkspaceParam("workspace:view"),
  mutate,
  async (request: Request, response: Response) =>
    response.json(await leaveWorkspace(workspaceOf(request))),
);

workspaceRouter.get(
  "/:workspaceId/members",
  ...withWorkspaceParam("members:view"),
  async (request: Request, response: Response) => {
    noStore(response);
    return response.json(await listMembers(workspaceOf(request)));
  },
);

workspaceRouter.patch(
  "/:workspaceId/members/:memberId",
  ...withWorkspaceParam("members:change_role"),
  mutate,
  async (request: Request, response: Response) => {
    const { memberId } = memberParamSchema.parse(request.params);
    return response.json(
      await changeMemberRole(workspaceOf(request), memberId, changeRoleSchema.parse(request.body)),
    );
  },
);

workspaceRouter.delete(
  "/:workspaceId/members/:memberId",
  ...withWorkspaceParam("members:remove"),
  mutate,
  async (request: Request, response: Response) => {
    const { memberId } = memberParamSchema.parse(request.params);
    return response.json(await removeMember(workspaceOf(request), memberId));
  },
);

workspaceRouter.get(
  "/:workspaceId/invitations",
  ...withWorkspaceParam("members:invite"),
  async (request: Request, response: Response) => {
    noStore(response);
    const query = listInvitationsSchema.parse(request.query);
    return response.json(await listInvitations(workspaceOf(request), query.status));
  },
);

workspaceRouter.post(
  "/:workspaceId/invitations",
  ...withWorkspaceParam("members:invite"),
  invite,
  async (request: Request, response: Response) =>
    response
      .status(201)
      .json(await createInvitation(workspaceOf(request), inviteSchema.parse(request.body))),
);

workspaceRouter.post(
  "/:workspaceId/invitations/:invitationId/resend",
  ...withWorkspaceParam("members:invite"),
  resend,
  async (request: Request, response: Response) => {
    const { invitationId } = invitationParamSchema.parse(request.params);
    return response.json(await resendInvitation(workspaceOf(request), invitationId));
  },
);

workspaceRouter.post(
  "/:workspaceId/invitations/:invitationId/revoke",
  ...withWorkspaceParam("members:invite"),
  mutate,
  async (request: Request, response: Response) => {
    const { invitationId } = invitationParamSchema.parse(request.params);
    return response.json(await revokeInvitation(workspaceOf(request), invitationId));
  },
);

workspaceRouter.get(
  "/:workspaceId/audit-logs",
  ...withWorkspaceParam("audit:view"),
  async (request: Request, response: Response) => {
    noStore(response);
    return response.json(
      await listAuditEvents(workspaceOf(request), auditQuerySchema.parse(request.query)),
    );
  },
);

export const invitationRouter = Router();
const tokenLimit = rateLimit("invitation:token", 30, 3600);

invitationRouter.get("/validate", tokenLimit, async (request: Request, response: Response) => {
  noStore(response);
  const { token } = validateInvitationSchema.parse(request.query);
  return response.json(await validateInvitation(token));
});

invitationRouter.post(
  "/accept",
  authenticate,
  tokenLimit,
  async (request: Request, response: Response) => {
    noStore(response);
    const { token } = acceptInvitationSchema.parse(request.body);
    return response.json(await acceptInvitation(userOf(request), token));
  },
);
