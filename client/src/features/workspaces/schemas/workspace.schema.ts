import { z } from "zod";

export const workspaceNameSchema = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters.")
  .max(60, "Name must be 60 characters or fewer.")
  .refine((value) => !/[<>]/.test(value), "Name can't contain markup.");

export const createWorkspaceSchema = z.object({ name: workspaceNameSchema });
export type CreateWorkspaceValues = z.infer<typeof createWorkspaceSchema>;

export const inviteMemberSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter an email address.")
    .email("Enter a valid email address.")
    .max(254),
  role: z.enum(["admin", "member", "viewer"]),
  message: z.string().trim().max(500, "Message must be 500 characters or fewer.").optional(),
});
export type InviteMemberValues = z.infer<typeof inviteMemberSchema>;

export const changeRoleSchema = z.object({ role: z.enum(["admin", "member", "viewer"]) });

export const transferOwnershipSchema = z.object({
  userId: z.string().min(1, "Choose a new owner."),
  password: z.string().min(1, "Enter your password to confirm."),
  confirm: z.literal(true, { message: "Confirm that you want to transfer ownership." }),
});
export type TransferOwnershipValues = z.infer<typeof transferOwnershipSchema>;

export const deleteWorkspaceSchema = (workspaceName: string) =>
  z.object({
    confirmName: z
      .string()
      .refine((value) => value.trim() === workspaceName, "Type the workspace name exactly."),
    password: z.string().min(1, "Enter your password to confirm."),
  });
