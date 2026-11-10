import { Schema, model, type Types } from "mongoose";

export interface IStatusPageService {
  _id: Types.ObjectId;
  pageId: Types.ObjectId;
  ownerId: Types.ObjectId;
  name: string;
  description: string;
  monitorIds: Types.ObjectId[];
  order: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const serviceSchema = new Schema<IStatusPageService>(
  {
    pageId: { type: Schema.Types.ObjectId, ref: "PublicStatusPage", required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 280, default: "" },
    monitorIds: { type: [{ type: Schema.Types.ObjectId, ref: "Monitor" }], default: [] },
    order: { type: Number, required: true, default: 0 },
    enabled: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

serviceSchema.index({ pageId: 1, order: 1 });
serviceSchema.index({ ownerId: 1, monitorIds: 1 });

export const StatusPageService = model<IStatusPageService>("StatusPageService", serviceSchema);
