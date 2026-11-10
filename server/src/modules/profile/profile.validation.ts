import { z } from "zod";

export const updateProfileSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters.")
      .max(80, "Name must be 80 characters or fewer.")
      .refine((value) => !/[<>]/.test(value), "Name cannot contain markup."),
  })
  .strict();
