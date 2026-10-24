import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Please enter your email address.")
    .email("Please enter a valid email address."),
  password: z.string().min(1, "Please enter your password."),
});

export const registerSchema = z
  .object({
    name: z
      .string()
      .min(1, "Please enter your name.")
      .min(2, "Name must be at least 2 characters."),
    email: z
      .string()
      .min(1, "Please enter your email address.")
      .email("Please enter a valid email address."),
    password: z.string().min(8, "Use at least 8 characters."),
    confirmPassword: z.string().min(1, "Please confirm your password."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });
