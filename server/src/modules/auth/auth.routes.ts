import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { login, logout, me, refresh, register } from "./auth.controller.js";

export const authRouter = Router();
authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.post("/refresh", refresh);
authRouter.get("/me", authenticate, me);
authRouter.post("/logout", authenticate, logout);
