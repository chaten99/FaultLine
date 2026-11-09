import { z } from "zod";
import { isBlockedHostname } from "../monitors/monitor-url.service.js";
import { isForbiddenAddress } from "../notifications/secure-http.service.js";
import net from "node:net";

export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const slugSchema = z
  .string()
  .trim()
  .min(3, "Use at least 3 characters.")
  .max(48, "Use 48 characters or fewer.")
  .regex(slugPattern, "Use lowercase letters, numbers and single hyphens only.");

const objectId = (label: string) => z.string().regex(/^[a-f\d]{24}$/i, `Invalid ${label} id.`);

export const idParamSchema = z.object({ id: objectId("status page") });
export const serviceParamSchema = z.object({
  id: objectId("status page"),
  serviceId: objectId("service"),
});

const nameSchema = z.string().trim().min(1, "Enter a name.").max(80, "Use 80 characters or fewer.");
const descriptionSchema = z.string().trim().max(280, "Use 280 characters or fewer.");

const hasMarkup = (value: string) => /[<>]/.test(value);

export const safeText = (schema: z.ZodString) =>
  schema.refine((value) => !hasMarkup(value), "Markup is not allowed.");

export const logoUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      const parsed = new URL(value);
      const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
      return (
        parsed.protocol === "https:" &&
        !parsed.username &&
        !parsed.password &&
        !isBlockedHostname(hostname) &&
        (net.isIP(hostname) === 0 || !isForbiddenAddress(hostname))
      );
    } catch {
      return false;
    }
  }, "Use a public https image URL.");

const brandingSchema = z
  .object({
    companyName: safeText(z.string().trim().max(80, "Use 80 characters or fewer.")).optional(),
    logoUrl: z.union([logoUrlSchema, z.literal(""), z.null()]).optional(),
  })
  .strict();

const eventsPatch = z
  .object({
    opened: z.boolean().optional(),
    acknowledged: z.boolean().optional(),
    resolved: z.boolean().optional(),
  })
  .strict();

export const createStatusPageSchema = z
  .object({
    name: safeText(nameSchema),
    slug: slugSchema,
    description: safeText(descriptionSchema).optional(),
    branding: brandingSchema.optional(),
    subscribersEnabled: z.boolean().optional(),
  })
  .strict();

export const updateStatusPageSchema = z
  .object({
    name: safeText(nameSchema).optional(),
    slug: slugSchema.optional(),
    description: safeText(descriptionSchema).optional(),
    branding: brandingSchema.optional(),
    subscribersEnabled: z.boolean().optional(),
    subscriberEvents: eventsPatch.optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: "Provide at least one field to update.",
  });

export const slugAvailabilitySchema = z.object({
  slug: z.string().trim().max(100),
  excludeId: objectId("status page").optional(),
});

export const monitorOptionsSchema = z.object({
  search: z.string().trim().max(100).optional(),
});

const monitorIdsSchema = z
  .array(objectId("monitor"))
  .max(50, "A service can include up to 50 monitors.")
  .transform((ids) => [...new Set(ids.map((id) => id.toLowerCase()))]);

export const createServiceSchema = z
  .object({
    name: safeText(nameSchema),
    description: safeText(descriptionSchema).optional(),
    monitorIds: monitorIdsSchema,
    enabled: z.boolean().optional(),
  })
  .strict();

export const updateServiceSchema = z
  .object({
    name: safeText(nameSchema).optional(),
    description: safeText(descriptionSchema).optional(),
    monitorIds: monitorIdsSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: "Provide at least one field to update.",
  });

export const reorderServicesSchema = z
  .object({ serviceIds: z.array(objectId("service")).max(20) })
  .strict();

export const subscribersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(["all", "pending", "active", "unsubscribed"]).default("all"),
});

export const slugParamSchema = z.object({ slug: slugSchema });

export const publicIncidentsQuerySchema = z.object({
  status: z.enum(["all", "active", "resolved"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(20).default(10),
});

export const publicHistoryQuerySchema = z.object({
  range: z.enum(["24h", "7d", "30d", "90d"]).default("30d"),
});

const emailSchema = z.string().trim().toLowerCase().max(254).email("Enter a valid email address.");

export const subscribeSchema = z
  .object({ email: emailSchema, events: eventsPatch.optional() })
  .strict();

export const resendSchema = z.object({ email: emailSchema }).strict();

const tokenSchema = z.string().trim().min(20).max(200);
export const tokenBodySchema = z.object({ token: tokenSchema }).strict();
export const tokenQuerySchema = z.object({ token: tokenSchema });
