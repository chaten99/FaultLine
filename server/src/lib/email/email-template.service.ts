import path from "node:path";
import { fileURLToPath } from "node:url";
import ejs from "ejs";

type EmailPurpose = "verification" | "password-reset";

type EmailData = {
  name: string;
  code: string;
  expiryMinutes: number;
};

type RenderedEmail = {
  html: string;
  text: string;
};

const templateRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "templates");

const templates: Record<EmailPurpose, string> = {
  verification: "verification/verify-email.ejs",
  "password-reset": "password-reset/reset-password.ejs",
};

export const renderAuthenticationEmail = async (
  purpose: EmailPurpose,
  data: EmailData,
): Promise<RenderedEmail> => {
  const templatePath = path.join(templateRoot, templates[purpose]);
  const html = await ejs.renderFile(
    templatePath,
    { ...data, name: ejs.escapeXML(data.name) },
    { views: [templateRoot] },
  );
  const text = [
    "FaultLine",
    "",
    purpose === "verification" ? "Verify your email address" : "Reset your password",
    "",
    `Hi ${data.name},`,
    "",
    purpose === "verification"
      ? "Enter this code in FaultLine to verify your email address:"
      : "Enter this code in FaultLine to verify your password reset request:",
    "",
    data.code,
    "",
    `This code expires in ${data.expiryMinutes} minutes.`,
    "",
    purpose === "verification"
      ? "If you did not create a FaultLine account, you can safely ignore this email."
      : "If you did not request a password reset, ignore this email. Your password will not change unless the reset process is completed.",
  ].join("\n");
  return { html, text };
};
