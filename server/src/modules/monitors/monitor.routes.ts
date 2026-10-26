import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { create, get, list, remove, update } from "./monitor.controller.js";

export const monitorRouter = Router();
monitorRouter.use(authenticate);
monitorRouter.get("/", list);
monitorRouter.post("/", create);
monitorRouter.get("/:id", get);
monitorRouter.patch("/:id", update);
monitorRouter.delete("/:id", remove);
