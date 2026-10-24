import { Schema, model } from "mongoose";

const refreshTokenFamilySchema = new Schema(
  {
    familyId: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const RefreshTokenFamily = model("RefreshTokenFamily", refreshTokenFamilySchema);
