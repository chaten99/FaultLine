import { Schema, model } from "mongoose";

const passwordResetGrantSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    digest: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

passwordResetGrantSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const PasswordResetGrant = model("PasswordResetGrant", passwordResetGrantSchema);
