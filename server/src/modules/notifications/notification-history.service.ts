import { Types } from "mongoose";
import { createApiError } from "../../lib/errors/create-api-error.js";
import { NotificationDelivery } from "./notification-delivery.model.js";
import { retryFailedDelivery } from "./notification-delivery.service.js";
import { toDeliveryDetail, toDeliverySummary } from "./notification-presenter.js";
import type { ChannelType, DeliveryEventType, DeliveryStatus } from "./notification.types.js";

export type DeliveryListOptions = {
  page: number;
  pageSize: number;
  status?: DeliveryStatus;
  channel?: ChannelType;
  eventType?: DeliveryEventType;
  from?: Date;
  to?: Date;
};

export const listDeliveries = async (workspaceId: string, options: DeliveryListOptions) => {
  const filter: Record<string, unknown> = { workspaceId: new Types.ObjectId(workspaceId) };
  if (options.status) filter.status = options.status;
  if (options.channel) filter.channel = options.channel;
  if (options.eventType) filter.eventType = options.eventType;
  if (options.from || options.to) {
    filter.createdAt = {
      ...(options.from ? { $gte: options.from } : {}),
      ...(options.to ? { $lte: options.to } : {}),
    };
  }
  const [items, total] = await Promise.all([
    NotificationDelivery.find(filter)
      .sort({ createdAt: -1 })
      .skip((options.page - 1) * options.pageSize)
      .limit(options.pageSize)
      .select("-snapshot"),
    NotificationDelivery.countDocuments(filter),
  ]);
  return {
    items: items.map(toDeliverySummary),
    page: options.page,
    pageSize: options.pageSize,
    total,
    totalPages: Math.ceil(total / options.pageSize) || 1,
  };
};

export const getDelivery = async (workspaceId: string, id: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw createApiError("Delivery not found.", 404, "DELIVERY_NOT_FOUND");
  }
  const delivery = await NotificationDelivery.findOne({
    _id: id,
    workspaceId: new Types.ObjectId(workspaceId),
  }).select("-snapshot");
  if (!delivery) throw createApiError("Delivery not found.", 404, "DELIVERY_NOT_FOUND");
  return { delivery: toDeliveryDetail(delivery) };
};

export const retryDelivery = async (workspaceId: string, id: string) => {
  const delivery = await retryFailedDelivery(workspaceId, id);
  if (!delivery) throw createApiError("Delivery not found.", 404, "DELIVERY_NOT_FOUND");
  return { delivery: toDeliverySummary(delivery) };
};
