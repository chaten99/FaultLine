import type { Request, Response } from "express";
import { Router } from "express";
import { createApiError } from "../../lib/errors/create-api-error.js";
import { rateLimit } from "../../lib/rate-limit.js";
import { authenticate } from "../../middleware/authenticate.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { getProfile, updateProfile } from "./profile.service.js";
import { updateProfileSchema } from "./profile.validation.js";

const owner = (request: Request) => {
  const id = (request as AuthenticatedRequest).userId;
  if (!id) throw createApiError("Authentication required.", 401, "AUTHENTICATION_REQUIRED");
  return id;
};

export const profileRouter = Router();
profileRouter.use(authenticate);

profileRouter.get("/", async (request: Request, response: Response) => {
  response.setHeader("Cache-Control", "private, no-store");
  return response.json(await getProfile(owner(request)));
});

profileRouter.patch(
  "/",
  rateLimit("profile:update", 20, 3600),
  async (request: Request, response: Response) =>
    response.json(await updateProfile(owner(request), updateProfileSchema.parse(request.body))),
);
