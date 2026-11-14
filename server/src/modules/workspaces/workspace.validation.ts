import { z } from "zod";
import { assignableRoles } from "./workspace.types.js";

const objectId = (label: string) => z.string().regex(/^[a-f\d]{24}$/i, `Invalid ${label} id.`);

export const workspaceNameSchema = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters.")
  .max(60, "Name must be 60 characters or fewer.")
  .refine((value) => !/[<>]/.test(value), "Name cannot contain markup.");

export const workspaceParamSchema = z.object({ workspaceId: objectId("workspace") });
export const memberParamSchema = z.object({
  workspaceId: objectId("workspace"),
  memberId: objectId("member"),
});
export const invitationParamSchema = z.object({
  workspaceId: objectId("workspace"),
  invitationId: objectId("invitation"),
});

export const createWorkspaceSchema = z.object({ name: workspaceNameSchema }).strict();
export const updateWorkspaceSchema = z.object({ name: workspaceNameSchema }).strict();

export const deleteWorkspaceSchema = z
  .object({
    confirmName: z.string().min(1, "Type the workspace name to confirm."),
    password: z.string().min(1, "Enter your password to confirm.").max(128),
  })
  .strict();

export const transferOwnershipSchema = z
  .object({
    userId: objectId("user"),
    password: z.string().min(1, "Enter your password to confirm.").max(128),
  })
  .strict();

export const changeRoleSchema = z
  .object({ role: z.enum(assignableRoles, { message: "Choose Admin, Member or Viewer." }) })
  .strict();

export const inviteSchema = z
  .object({
    email: z.string().trim().toLowerCase().max(254).email("Enter a valid email address."),
    role: z.enum(assignableRoles, { message: "Choose Admin, Member or Viewer." }),
    message: z
      .string()
      .trim()
      .max(500, "Message must be 500 characters or fewer.")
      .refine((value) => !/[<>]/.test(value), "Message cannot contain markup.")
      .optional(),
  })
  .strict();

export const listInvitationsSchema = z.object({
  status: z.enum(["pending", "expired", "all"]).default("pending"),
});

export const tokenSchema = z.string().trim().min(20).max(200);
export const validateInvitationSchema = z.object({ token: tokenSchema });
export const acceptInvitationSchema = z.object({ token: tokenSchema }).strict();

export const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  type: z.string().max(60).optional(),
});
