import { Router } from "express";
import { withWorkspace } from "../workspaces/workspace-context.js";
import { rateLimit } from "../../lib/rate-limit.js";
import {
  addService,
  analytics,
  create,
  editService,
  get,
  list,
  monitorOptions,
  preview,
  publish,
  remove,
  removeService,
  reorder,
  services,
  slugAvailable,
  subscribers,
  unpublish,
  update,
} from "./status-page.controller.js";

export const statusPageRouter = Router();
const mutationLimit = rateLimit("status-pages:mutate", 60, 60);
const readLimit = rateLimit("status-pages:read", 240, 60);

const view = withWorkspace("status_pages:view");
const manage = withWorkspace("status_pages:manage");
statusPageRouter.get("/", ...view, readLimit, list);
statusPageRouter.post("/", ...manage, mutationLimit, create);
statusPageRouter.get("/slug-available", ...view, readLimit, slugAvailable);
statusPageRouter.get("/monitor-options", ...view, readLimit, monitorOptions);
statusPageRouter.get("/:id", ...view, readLimit, get);
statusPageRouter.patch("/:id", ...manage, mutationLimit, update);
statusPageRouter.delete("/:id", ...manage, mutationLimit, remove);
statusPageRouter.post("/:id/publish", ...manage, mutationLimit, publish);
statusPageRouter.post("/:id/unpublish", ...manage, mutationLimit, unpublish);
statusPageRouter.get("/:id/services", ...view, readLimit, services);
statusPageRouter.post("/:id/services", ...manage, mutationLimit, addService);
statusPageRouter.post("/:id/services/reorder", ...manage, mutationLimit, reorder);
statusPageRouter.patch("/:id/services/:serviceId", ...manage, mutationLimit, editService);
statusPageRouter.delete("/:id/services/:serviceId", ...manage, mutationLimit, removeService);
statusPageRouter.post("/:id/preview", ...view, readLimit, preview);
statusPageRouter.get("/:id/subscribers", ...manage, readLimit, subscribers);
statusPageRouter.get("/:id/analytics", ...view, readLimit, analytics);
