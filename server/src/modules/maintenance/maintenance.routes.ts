import { Router } from "express";
import { withWorkspace, workspaceOf } from "../workspaces/workspace-context.js";
import { maintenanceSchema, listMaintenance, saveMaintenance } from "./maintenance.service.js";
import { monitorIdSchema } from "../monitors/monitor.validation.js";
import { MaintenanceWindow } from "./maintenance.model.js";
import { createApiError } from "../../lib/errors/create-api-error.js";
export const maintenanceRouter = Router();
maintenanceRouter.get("/", ...withWorkspace("monitors:view"), async (req, res) =>
  res.json({ items: await listMaintenance(workspaceOf(req)) }),
);
maintenanceRouter.post("/", ...withWorkspace("monitors:write"), async (req, res) =>
  res.status(201).json(await saveMaintenance(workspaceOf(req), maintenanceSchema.parse(req.body))),
);
maintenanceRouter.patch("/:id", ...withWorkspace("monitors:write"), async (req, res) =>
  res.json(
    await saveMaintenance(
      workspaceOf(req),
      maintenanceSchema.parse(req.body),
      monitorIdSchema.parse(req.params).id,
    ),
  ),
);
maintenanceRouter.delete("/:id", ...withWorkspace("monitors:write"), async (req, res) => {
  const result = await MaintenanceWindow.deleteOne({
    _id: monitorIdSchema.parse(req.params).id,
    workspaceId: workspaceOf(req).workspaceId,
  });
  if (!result.deletedCount)
    throw createApiError("Maintenance window not found.", 404, "MONITOR_NOT_FOUND");
  return res.status(204).send();
});
