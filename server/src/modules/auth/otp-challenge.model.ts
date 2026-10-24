import { Schema, model } from "mongoose";

const otpChallengeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    pendingLoginId: {
      type: Schema.Types.ObjectId,
      ref: "PendingLogin",
      default: null,
      index: true,
    },
    email: { type: String, required: true, index: true },
    purpose: {
      type: String,
      enum: ["email_verification", "password_reset"],
      required: true,
      index: true,
    },
    digest: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    consumedAt: { type: Date, default: null },
    supersededAt: { type: Date, default: null },
    deliveryStatus: { type: String, enum: ["pending", "sent", "failed"], required: true },
    ipAddress: { type: String, required: true },
  },
  { timestamps: true },
);

otpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const OtpChallenge = model("OtpChallenge", otpChallengeSchema);
