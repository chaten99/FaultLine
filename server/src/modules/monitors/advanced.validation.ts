import { z } from "zod";
import net from "node:net";
import { isBlockedHostname } from "./monitor-url.service.js";
import { domainToASCII } from "node:url";

export const hostnameSchema = z
  .string()
  .trim()
  .min(3)
  .max(253)
  .transform((v) => domainToASCII(v.replace(/\.$/, "").toLowerCase()))
  .refine(
    (v) =>
      !isBlockedHostname(v) &&
      net.isIP(v) === 0 &&
      v.includes(".") &&
      v.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)),
    "Enter a public DNS hostname.",
  );
export const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const protectedHeaders = new Set([
  "host",
  "content-length",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  "proxy-connection",
  "proxy-authorization",
  "proxy-authenticate",
  "accept-encoding",
  "expect",
]);
const header = z
  .object({
    name: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/)
      .transform((v) => v.toLowerCase())
      .refine((v) => !protectedHeaders.has(v)),
    value: z
      .string()
      .max(4096)
      .regex(/^[\t\x20-\x7e]*$/)
      .optional(),
    secret: z.boolean().default(false),
    saved: z.boolean().optional(),
  })
  .strict();
const scalar = z.union([z.string().max(1000), z.number().finite(), z.boolean(), z.null()]);
export const assertionSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/)
      .refine(
        (v) => !v.split(".").some((p) => ["__proto__", "constructor", "prototype"].includes(p)),
      ),
    operator: z.enum(["exists", "equals", "not_equals", "contains", "greater_than", "less_than"]),
    value: scalar.optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.operator === "exists" ||
      (v.value !== undefined &&
        (!["greater_than", "less_than"].includes(v.operator) || typeof v.value === "number") &&
        (v.operator !== "contains" || typeof v.value === "string")),
    "Choose a value appropriate for the assertion operator.",
  );
export const httpConfigSchema = z
  .object({
    authType: z.enum(["none", "bearer", "basic", "custom"]).default("none"),
    token: z
      .string()
      .min(1)
      .max(4096)
      .regex(/^[\x21-\x7e]+$/)
      .optional(),
    username: z
      .string()
      .max(500)
      .regex(/^[^:\r\n]*$/)
      .optional(),
    password: z
      .string()
      .max(1000)
      .regex(/^[^\r\n]*$/)
      .optional(),
    credentialsSaved: z.boolean().optional(),
    headers: z.array(header).max(20).default([]),
    contentType: z.enum(["application/json", "text/plain"]).default("application/json"),
    body: z.string().max(8192).nullable().optional(),
    bodySaved: z.boolean().optional(),
    keyword: z
      .object({ text: z.string().min(1).max(500), caseSensitive: z.boolean().default(true) })
      .strict()
      .optional(),
    assertions: z.array(assertionSchema).max(20).default([]),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.headers.map((h) => h.name)).size !== v.headers.length)
      ctx.addIssue({ code: "custom", message: "Header names must be unique.", path: ["headers"] });
    if (v.headers.reduce((n, h) => n + h.name.length + (h.value?.length ?? 0), 0) > 8192)
      ctx.addIssue({ code: "custom", message: "Headers exceed 8 KB.", path: ["headers"] });
    if (v.authType !== "custom" && v.headers.some((h) => h.name === "authorization"))
      ctx.addIssue({
        code: "custom",
        message: "Use authentication settings for Authorization.",
        path: ["headers"],
      });
    if (v.contentType === "application/json" && v.body) {
      try {
        JSON.parse(v.body);
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "Request body must be valid JSON.",
          path: ["body"],
        });
      }
    }
  });
export const tlsConfigSchema = z
  .object({ warningDays: z.number().int().min(1).max(365).default(30) })
  .strict();
export const dnsConfigSchema = z
  .object({
    recordType: z.enum(["A", "AAAA", "CNAME", "MX", "TXT", "NS"]),
    expectedValues: z.array(z.string().min(1).max(1000)).max(50).default([]),
    comparison: z.enum(["includes", "exact"]).default("includes"),
  })
  .strict()
  .superRefine((config, ctx) => {
    for (const [index, value] of config.expectedValues.entries()) {
      const valid =
        config.recordType === "A"
          ? net.isIPv4(value)
          : config.recordType === "AAAA"
            ? net.isIPv6(value)
            : config.recordType === "TXT"
              ? true
              : config.recordType === "MX"
                ? /^(?:[0-9]{1,5})\s+/.test(value) &&
                  Number(value.split(/\s+/)[0]) <= 65535 &&
                  hostnameSchema.safeParse(value.replace(/^[0-9]+\s+/, "")).success
                : hostnameSchema.safeParse(value).success;
      if (!valid)
        ctx.addIssue({
          code: "custom",
          message: "Expected value does not match the DNS record type.",
          path: ["expectedValues", index],
        });
    }
    if (config.comparison === "exact" && !config.expectedValues.length)
      ctx.addIssue({
        code: "custom",
        message: "Exact comparison requires expected records.",
        path: ["expectedValues"],
      });
  });
export const domainConfigSchema = tlsConfigSchema;
export type HttpConfig = z.infer<typeof httpConfigSchema>;
export type Assertion = z.infer<typeof assertionSchema>;
export type DnsConfig = z.infer<typeof dnsConfigSchema>;
