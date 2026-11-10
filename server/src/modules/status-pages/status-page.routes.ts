import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
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

statusPageRouter.use(authenticate);
statusPageRouter.get("/", readLimit, list);
statusPageRouter.post("/", mutationLimit, create);
statusPageRouter.get("/slug-available", readLimit, slugAvailable);
statusPageRouter.get("/monitor-options", readLimit, monitorOptions);
statusPageRouter.get("/:id", readLimit, get);
statusPageRouter.patch("/:id", mutationLimit, update);
statusPageRouter.delete("/:id", mutationLimit, remove);
statusPageRouter.post("/:id/publish", mutationLimit, publish);
statusPageRouter.post("/:id/unpublish", mutationLimit, unpublish);
statusPageRouter.get("/:id/services", readLimit, services);
statusPageRouter.post("/:id/services", mutationLimit, addService);
statusPageRouter.post("/:id/services/reorder", mutationLimit, reorder);
statusPageRouter.patch("/:id/services/:serviceId", mutationLimit, editService);
statusPageRouter.delete("/:id/services/:serviceId", mutationLimit, removeService);
statusPageRouter.post("/:id/preview", readLimit, preview);
statusPageRouter.get("/:id/subscribers", readLimit, subscribers);
statusPageRouter.get("/:id/analytics", readLimit, analytics);
