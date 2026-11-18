import { Router } from "express";
import { withWorkspace } from "../workspaces/workspace-context.js";
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

import { workspaceOf } from "../workspaces/workspace-context.js";
import { getMonitor } from "./monitor.service.js";
import { MonitorCheck } from "../checks/monitor-check.model.js";
import { monitorIdSchema } from "./monitor.validation.js";

export const monitorRouter = Router();
monitorRouter.get("/", ...withWorkspace("monitors:view"), list);
monitorRouter.post("/", ...withWorkspace("monitors:write"), create);
monitorRouter.get("/:id/protocol-history", ...withWorkspace("monitors:view"), async (req, res) => {
  const { id } = monitorIdSchema.parse(req.params);
  await getMonitor(workspaceOf(req), id);
  return res.json({
    items: await MonitorCheck.find({ monitorId: id, completedAt: { $exists: true } })
      .sort({ completedAt: -1 })
      .limit(200)
      .lean(),
  });
});
monitorRouter.get("/:id", ...withWorkspace("monitors:view"), get);
monitorRouter.patch("/:id", ...withWorkspace("monitors:write"), update);
monitorRouter.delete("/:id", ...withWorkspace("monitors:write"), remove);
monitorRouter.post("/:id/check-now", ...withWorkspace("monitors:write"), checkNow);
monitorRouter.get("/:id/checks", ...withWorkspace("monitors:view"), listChecks);
monitorRouter.get("/:id/checks/:checkId", ...withWorkspace("monitors:view"), getCheck);
