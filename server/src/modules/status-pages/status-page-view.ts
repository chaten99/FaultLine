import { env } from "../../config/env.js";
import type { IPublicStatusPage } from "./status-page.model.js";
import type { PageStatusSnapshot } from "./status-page-snapshot.service.js";
import type { PublicIncident, SubscriberEvents } from "./status-page.types.js";

export const publicUrlFor = (slug: string): string =>
  `${env.APP_ORIGIN.replace(/\/+$/, "")}/status/${slug}`;

export type PublicPagePayload = {
  page: {
    name: string;
    slug: string;
    description: string;
    branding: { companyName: string; logoUrl: string | null };
    subscribersEnabled: boolean;
    subscriberEvents: SubscriberEvents;
  };
  status: PageStatusSnapshot["status"];
  incidents: { active: PublicIncident[] };
  preview?: boolean;
};

export const toPublicPayload = (
  page: Pick<
    IPublicStatusPage,
    "name" | "slug" | "description" | "branding" | "subscribersEnabled" | "subscriberEvents"
  >,
  snapshot: PageStatusSnapshot,
  options: { preview?: boolean } = {},
): PublicPagePayload => ({
  page: {
    name: page.name,
    slug: page.slug,
    description: page.description ?? "",
    branding: {
      companyName: page.branding?.companyName || page.name,
      logoUrl: page.branding?.logoUrl || null,
    },
    subscribersEnabled: page.subscribersEnabled,
    subscriberEvents: {
      opened: page.subscriberEvents?.opened ?? true,
      acknowledged: page.subscriberEvents?.acknowledged ?? false,
      resolved: page.subscriberEvents?.resolved ?? true,
    },
  },
  status: snapshot.status,
  incidents: { active: snapshot.activeIncidents },
  ...(options.preview ? { preview: true } : {}),
});

export const maskEmail = (email: string): string => {
  const [local = "", domain = ""] = email.split("@");
  const visible = local.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(2, Math.min(local.length - 1, 6)))}@${domain}`;
};
