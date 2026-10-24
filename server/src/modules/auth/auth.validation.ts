import { z } from "zod";

export const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Please enter your name.")
      .min(2, "Name must be at least 2 characters.")
      .max(80),
    email: z
      .string()
      .trim()
      .min(1, "Please enter your email address.")
      .email("Please enter a valid email address.")
      .max(254),
    password: z.string().min(8, "Password must be at least 8 characters.").max(128),
    confirmPassword: z.string().min(1, "Please confirm your password."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const emailOtpSchema = z.object({
  email: z.string().trim().email().max(254),
  code: z.string().regex(/^\d{6}$/, "Enter the six-digit code."),
  challengeId: z.string().min(1).optional(),
});
export const emailSchema = z.object({
  email: z.string().trim().email().max(254),
  challengeId: z.string().min(1).optional(),
});
export const resetPasswordSchema = z.object({
  grant: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters.").max(128),
});

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Please enter your email address.")
    .email("Please enter a valid email address.")
    .max(254),
  password: z.string().min(1, "Please enter your password.").max(128),
});
