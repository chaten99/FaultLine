import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { rateLimit } from "../../lib/rate-limit.js";
import {
  forgotPassword,
  login,
  logout,
  me,
  password,
  removeOtherSessions,
  removeSession,
  sessions,
  refresh,
  register,
  resendVerification,
  resetPassword,
  verifyEmail,
  verifyReset,
} from "./auth.controller.js";

export const authRouter = Router();
authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.post("/email-verification/verify", verifyEmail);
authRouter.post("/email-verification/resend", resendVerification);
authRouter.post("/forgot-password", forgotPassword);
authRouter.post("/forgot-password/verify-otp", verifyReset);
authRouter.post("/reset-password", resetPassword);
authRouter.post("/refresh", refresh);
authRouter.get("/me", authenticate, me);
authRouter.post("/logout", authenticate, logout);
authRouter.post("/password", authenticate, rateLimit("auth:password", 5, 900), password);
authRouter.get("/sessions", authenticate, sessions);
authRouter.post(
  "/sessions/revoke-others",
  authenticate,
  rateLimit("auth:sessions", 20, 900),
  removeOtherSessions,
);
authRouter.delete(
  "/sessions/:id",
  authenticate,
  rateLimit("auth:sessions", 20, 900),
  removeSession,
);
