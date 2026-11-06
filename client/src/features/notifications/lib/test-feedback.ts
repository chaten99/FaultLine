import { toast } from "sonner";
import { failureCategoryLabel } from "./notification-presentation";
import type { DeliverySummary } from "../types/notification.types";

export const reportTestDelivery = (delivery: DeliverySummary, target: string) => {
  if (delivery.status === "delivered") {
    toast.success(`Test notification delivered to ${target}.`);
    return;
  }
  if (delivery.status === "failed") {
    const reason = delivery.message ?? failureCategoryLabel(delivery.failureCategory);
    toast.error(`Test notification to ${target} failed: ${reason}`);
    return;
  }
  toast.info(`Test notification to ${target} is ${delivery.status}. Check delivery history.`);
};
