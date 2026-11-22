import { Schema, model } from "mongoose";
const schema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true, index: true },
    title: { type: String, required: true, maxlength: 100 },
    description: { type: String, maxlength: 1000 },
    monitorIds: [{ type: Schema.Types.ObjectId, ref: "Monitor" }],
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    timezone: { type: String, required: true },
    recurrence: { type: String, enum: ["once", "weekly"], default: "once" },
    enabled: { type: Boolean, default: true },
    notifyDuring: { type: Boolean, default: false },
    notifyAfter: { type: Boolean, default: true },
  },
  { timestamps: true },
);
schema.index({ workspaceId: 1, enabled: 1 });
export const MaintenanceWindow = model("MaintenanceWindow", schema);
