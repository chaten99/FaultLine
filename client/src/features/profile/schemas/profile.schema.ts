import { z } from "zod";
import { normalizeName } from "../lib/profile-presentation";

export const profileNameSchema = z.object({
  name: z
    .string()
    .transform(normalizeName)
    .pipe(
      z
        .string()
        .min(1, "Please enter your name.")
        .min(2, "Name must be at least 2 characters.")
        .max(80, "Name cannot exceed 80 characters."),
    ),
});

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z
      .string()
      .min(8, "Use at least 8 characters.")
      .max(128, "Use 128 characters or fewer."),
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    path: ["newPassword"],
    message: "Choose a password you haven't used here.",
  });

export type ProfileNameValues = z.input<typeof profileNameSchema>;
export type PasswordChangeValues = z.input<typeof passwordChangeSchema>;
