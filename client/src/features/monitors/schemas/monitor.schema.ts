import { z } from "zod";

export const monitorIntervals = [60, 300, 600, 900, 1800, 3600] as const;

export const monitorFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Monitor name is required")
    .max(100, "Monitor name cannot exceed 100 characters"),
  url: z
    .string()
    .trim()
    .min(1, "Endpoint URL is required")
    .max(2048, "Endpoint URL is too long")
    .refine((value) => {
      try {
        const parsed = new URL(value);
        return (
          (parsed.protocol === "http:" || parsed.protocol === "https:") &&
          !parsed.username &&
          !parsed.password
        );
      } catch {
        return false;
      }
    }, "Enter a valid HTTP or HTTPS URL (e.g. https://api.example.com/health)"),
  method: z.literal("GET"),
  intervalSeconds: z
    .number()
    .int()
    .refine(
      (value) => monitorIntervals.includes(value as (typeof monitorIntervals)[number]),
      "Please select a valid interval",
    ),
  timeoutMs: z
    .number()
    .int()
    .min(1000, "Timeout must be at least 1,000ms")
    .max(30000, "Timeout cannot exceed 30,000ms"),
  expectedStatusCodes: z
    .string()
    .trim()
    .min(1, "At least one expected status code is required")
    .refine((val) => {
      const parts = val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length === 0 || parts.length > 20) return false;
      return parts.every((p) => {
        const num = Number(p);
        return Number.isInteger(num) && num >= 100 && num <= 599;
      });
    }, "Must be valid HTTP status codes (100–599) separated by commas"),
  active: z.boolean(),
});

export type MonitorFormValues = z.infer<typeof monitorFormSchema>;

export const parseStatusCodes = (raw: string): number[] => {
  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 100 && n <= 599);
};

export const formatStatusCodes = (codes: number[]): string => {
  return codes.join(", ");
};

export const formatInterval = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
};
