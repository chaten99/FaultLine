import { Schema, model } from "mongoose";

const pendingLoginSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    email: { type: String, required: true },
    digest: { type: String, required: true, unique: true },
    otpChallengeId: { type: Schema.Types.ObjectId, ref: "OtpChallenge", default: null },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
    supersededAt: { type: Date, default: null },
  },
  { timestamps: true },
);

pendingLoginSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const PendingLogin = model("PendingLogin", pendingLoginSchema);
