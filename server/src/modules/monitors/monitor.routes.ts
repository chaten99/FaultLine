import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import {
  checkNow,
  create,
  get,
  getCheck,
  list,
  listChecks,
  remove,
  update,
} from "./monitor.controller.js";

export const monitorRouter = Router();
monitorRouter.use(authenticate);
monitorRouter.get("/", list);
monitorRouter.post("/", create);
monitorRouter.get("/:id", get);
monitorRouter.patch("/:id", update);
monitorRouter.delete("/:id", remove);
monitorRouter.post("/:id/check-now", checkNow);
monitorRouter.get("/:id/checks", listChecks);
monitorRouter.get("/:id/checks/:checkId", getCheck);
