import { Schema, model, type Types } from "mongoose";
import { workspaceTypes, type WorkspaceType } from "./workspace.types.js";

export interface IWorkspace {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  type: WorkspaceType;
  createdBy: Types.ObjectId;
  ownerId: Types.ObjectId;
  status: "active" | "deleted";
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;
  purgeAfter?: Date;
  purgedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const workspaceSchema = new Schema<IWorkspace>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 80,
      unique: true,
    },
    type: { type: String, enum: workspaceTypes, required: true, default: "team" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["active", "deleted"], required: true, default: "active" },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User" },
    purgeAfter: { type: Date },
    purgedAt: { type: Date },
  },
  { timestamps: true },
);

workspaceSchema.index({ ownerId: 1, status: 1 });
workspaceSchema.index(
  { createdBy: 1 },
  { unique: true, partialFilterExpression: { type: "personal" } },
);
workspaceSchema.index({ status: 1, purgeAfter: 1 });

export const Workspace = model<IWorkspace>("Workspace", workspaceSchema);
