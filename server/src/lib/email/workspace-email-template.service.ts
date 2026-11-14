import path from "node:path";
import { fileURLToPath } from "node:url";
import ejs from "ejs";
import { roleDescriptions } from "../../modules/workspaces/workspace-permissions.js";
import type { AssignableRole } from "../../modules/workspaces/workspace.types.js";

const templateRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "templates");
const footer = "This is an automated invitation from FaultLine.";

const roleLabels: Record<AssignableRole, string> = {
  admin: "an Admin",
  member: "a Member",
  viewer: "a Viewer",
};

export const invitationSubject = "You've been invited to join a FaultLine workspace";

export const renderInvitationEmail = async (input: {
  workspaceName: string;
  inviterName: string;
  role: AssignableRole;
  email: string;
  message?: string;
  acceptUrl: string;
  expiryDays: number;
}): Promise<{ subject: string; html: string; text: string }> => {
  const roleDescription = roleDescriptions[input.role];
  const html = await ejs.renderFile(
    path.join(templateRoot, "workspace/invitation.ejs"),
    {
      subject: invitationSubject,
      footer,
      e: ejs.escapeXML,
      workspaceName: input.workspaceName,
      inviterName: input.inviterName,
      roleLabel: roleLabels[input.role],
      roleDescription,
      personalMessage: input.message ?? "",
      acceptUrl: input.acceptUrl,
      expiryDays: input.expiryDays,
      email: input.email,
    },
    { views: [templateRoot] },
  );
  const text = [
    "FaultLine",
    "",
    `You've been invited to join ${input.workspaceName}`,
    "",
    `${input.inviterName} invited you to collaborate in the ${input.workspaceName} workspace as ${roleLabels[input.role]}.`,
    roleDescription,
    ...(input.message ? ["", `Message from ${input.inviterName}: ${input.message}`] : []),
    "",
    "Accept the invitation:",
    input.acceptUrl,
    "",
    `This invitation expires in ${input.expiryDays} days and can be used once.`,
    `Sign in or create an account with ${input.email} to accept. If you weren't expecting this, ignore this email.`,
    "",
    footer,
  ].join("\n");
  return { subject: invitationSubject, html, text };
};
