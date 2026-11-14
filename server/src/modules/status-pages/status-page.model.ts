import { Schema, model, type Types } from "mongoose";
import { pageStatuses, type PageStatus, type SubscriberEvents } from "./status-page.types.js";

export interface IPublicStatusPage {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  ownerId: Types.ObjectId;
  name: string;
  slug: string;
  description: string;
  branding: { companyName: string; logoUrl: string | null };
  status: PageStatus;
  publishedAt: Date | null;
  subscribersEnabled: boolean;
  subscriberEvents: SubscriberEvents;
  createdAt: Date;
  updatedAt: Date;
}

const statusPageSchema = new Schema<IPublicStatusPage>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 48,
      unique: true,
    },
    description: { type: String, trim: true, maxlength: 280, default: "" },
    branding: {
      companyName: { type: String, trim: true, maxlength: 80, default: "" },
      logoUrl: { type: String, trim: true, maxlength: 2048, default: null },
    },
    status: { type: String, enum: pageStatuses, required: true, default: "draft" },
    publishedAt: { type: Date, default: null },
    subscribersEnabled: { type: Boolean, required: true, default: true },
    subscriberEvents: {
      opened: { type: Boolean, default: true },
      acknowledged: { type: Boolean, default: false },
      resolved: { type: Boolean, default: true },
    },
  },
  { timestamps: true },
);

statusPageSchema.index({ workspaceId: 1, createdAt: -1 });
statusPageSchema.index({ ownerId: 1 });
statusPageSchema.index({ status: 1, slug: 1 });

export const PublicStatusPage = model<IPublicStatusPage>("PublicStatusPage", statusPageSchema);
