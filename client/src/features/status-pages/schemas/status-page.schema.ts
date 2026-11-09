import { z } from "zod";
import { validateSlug } from "../lib/slug";

export const isSafeLogoUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
};

const logoField = z
  .string()
  .trim()
  .max(2048, "Logo URL is too long")
  .refine((value) => value === "" || isSafeLogoUrl(value), "Use an https:// image URL");

export const statusPageFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter a page name")
    .max(80, "Page name cannot exceed 80 characters"),
  slug: z
    .string()
    .trim()
    .superRefine((value, context) => {
      const message = validateSlug(value);
      if (message) context.addIssue({ code: "custom", message });
    }),
  description: z.string().trim().max(300, "Description cannot exceed 300 characters"),
  companyName: z.string().trim().max(80, "Name cannot exceed 80 characters"),
  logoUrl: logoField,
});

export type StatusPageFormValues = z.infer<typeof statusPageFormSchema>;

export const serviceFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a service name")
    .max(80, "Name cannot exceed 80 characters"),
  description: z.string().trim().max(200, "Description cannot exceed 200 characters"),
  monitorIds: z.array(z.string()).min(1, "Select at least one monitor").max(25, "Select up to 25"),
});

export type ServiceFormValues = z.infer<typeof serviceFormSchema>;

export const subscribeFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your email address")
    .max(254, "Email address is too long")
    .email("Enter a valid email address"),
  opened: z.boolean(),
  acknowledged: z.boolean(),
  resolved: z.boolean(),
});

export type SubscribeFormValues = z.infer<typeof subscribeFormSchema>;

export const hasSelectedEvent = (values: {
  opened: boolean;
  acknowledged: boolean;
  resolved: boolean;
}): boolean => values.opened || values.acknowledged || values.resolved;
