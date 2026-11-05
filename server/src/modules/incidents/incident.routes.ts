import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { acknowledge, get, list, resolve, summary } from "./incident.controller.js";

export const incidentRouter = Router();
incidentRouter.use(authenticate);
incidentRouter.get("/", list);
incidentRouter.get("/summary", summary);
incidentRouter.get("/:id", get);
incidentRouter.post("/:id/acknowledge", acknowledge);
incidentRouter.post("/:id/resolve", resolve);
