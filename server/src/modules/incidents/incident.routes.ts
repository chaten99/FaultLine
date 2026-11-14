import { Router } from "express";
import { withWorkspace } from "../workspaces/workspace-context.js";
import { acknowledge, get, list, resolve, summary } from "./incident.controller.js";

export const incidentRouter = Router();
incidentRouter.get("/", ...withWorkspace("incidents:view"), list);
incidentRouter.get("/summary", ...withWorkspace("incidents:view"), summary);
incidentRouter.get("/:id", ...withWorkspace("incidents:view"), get);
incidentRouter.post("/:id/acknowledge", ...withWorkspace("incidents:acknowledge"), acknowledge);
incidentRouter.post("/:id/resolve", ...withWorkspace("incidents:acknowledge"), resolve);
